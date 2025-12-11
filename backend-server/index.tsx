import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import emailRoutes from './email_integration.tsx';
import healthRoutes from './health_records.tsx';
import conversationRoutes from './conversations.tsx';
import appointmentRoutes from './appointments.tsx';
import insuranceRoutes from './insurance.tsx';
import providerRoutes from './providers.tsx';
import nutritionRoutes from './nutrition.tsx';
import fitnessRoutes from './fitness.tsx';
import socialRoutes from './social.tsx';
import baybFriendsRoutes from './bayb_friends.tsx';
import adminRoutes from './admin.tsx';
import feedbackRoutes from './feedback.tsx';
import integrationsRoutes from './integrations.tsx';
import emailScannerRoutes from './email-scanner.tsx';
import restaurantBookingRoutes from './restaurant-booking.tsx';
import setupCheckRoutes from './setup-check.tsx';
import notificationsRoutes from './notifications.tsx';
import learningRoutes from './learning.tsx';
import advancedIntegrationsRoutes from './advanced-integrations.tsx';
import subscriptionRoutes from './subscriptions.tsx';
import testSmsRoutes from './test-sms.tsx';
import microsoftRoutes from './microsoft.tsx';
import elevenLabsRoutes from './elevenlabs.tsx';
import onboardingRoutes from './onboarding.tsx';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Mount email integration routes
app.route('/make-server-d32880b0/email', emailRoutes);

// Mount health records routes
app.route('/make-server-d32880b0/health', healthRoutes);

// Mount conversation routes
app.route('/make-server-d32880b0/conversations', conversationRoutes);

// Mount appointment routes
app.route('/make-server-d32880b0/appointments', appointmentRoutes);

// Mount insurance routes
app.route('/make-server-d32880b0/insurance', insuranceRoutes);

// Mount provider routes
app.route('/make-server-d32880b0/providers', providerRoutes);

// Mount nutrition routes
app.route('/make-server-d32880b0/nutrition', nutritionRoutes);

// Mount fitness routes
app.route('/make-server-d32880b0/fitness', fitnessRoutes);

// Mount social planning routes
app.route('/make-server-d32880b0/social', socialRoutes);

// Mount BAYB Friends routes
app.route('/make-server-d32880b0/bayb-friends', baybFriendsRoutes);

// Mount admin routes
app.route('/make-server-d32880b0/admin', adminRoutes);

// Mount feedback routes
app.route('/make-server-d32880b0/feedback', feedbackRoutes);

// Mount integrations routes
app.route('/make-server-d32880b0/integrations', integrationsRoutes);

// Mount email scanner routes
app.route('/make-server-d32880b0/email-scanner', emailScannerRoutes);

// Mount restaurant booking routes
app.route('/make-server-d32880b0/restaurants', restaurantBookingRoutes);

// Mount setup check routes
app.route('/make-server-d32880b0/setup', setupCheckRoutes);

// Mount notifications routes
app.route('/make-server-d32880b0/notifications', notificationsRoutes);

// Mount learning routes
app.route('/make-server-d32880b0/learning', learningRoutes);

// Mount advanced integrations routes (these have full paths already)
app.route('/', advancedIntegrationsRoutes);

// Mount subscription routes
app.route('/make-server-d32880b0/subscriptions', subscriptionRoutes);

// Mount test SMS routes (with Twilio integration)
app.route('/make-server-d32880b0/test-sms', testSmsRoutes);

// Mount Microsoft integration routes
app.route('/make-server-d32880b0/microsoft', microsoftRoutes);

// Mount ElevenLabs integration routes
app.route('/make-server-d32880b0/elevenlabs', elevenLabsRoutes);

// Mount onboarding routes
app.route('/make-server-d32880b0/onboarding', onboardingRoutes);

// ==================== USER MANAGEMENT ====================

// Create new user account
app.post('/make-server-d32880b0/auth/signup', async (c) => {
  try {
    const { email, password, name, userData } = await c.req.json();

    // Get current user count
    const userCountData = await kv.get('user:count');
    const currentCount = userCountData?.count || 0;

    // Enforce 250 user limit for beta
    if (currentCount >= 250) {
      console.log(`Beta signup limit reached. Current count: ${currentCount}`);
      return c.json({ 
        error: 'Beta registration is now closed',
        message: 'We\'ve reached our limit of 250 beta users. Join our waitlist to be notified when we open registration again!'
      }, 403);
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true // Auto-confirm since email server not configured
    });

    if (authError) {
      console.error('Signup auth error:', authError);
      return c.json({ error: authError.message }, 400);
    }

    // Increment user count and assign user number
    const newUserNumber = currentCount + 1;
    await kv.set('user:count', { count: newUserNumber });

    // Determine user tier
    let tier = '';
    let tierDescription = '';
    if (newUserNumber <= 25) {
      tier = 'founding';
      tierDescription = 'Founding Member - Free for Life';
    } else if (newUserNumber <= 250) {
      tier = 'early-beta';
      tierDescription = 'Early Beta - 1 Year Free + 50% Off for Life';
    }

    // Store user profile data with user number
    const userProfile = {
      id: authData.user.id,
      email,
      name,
      userNumber: newUserNumber,
      tier,
      tierDescription,
      ...userData,
      createdAt: new Date().toISOString()
    };

    await kv.set(`user:${authData.user.id}`, userProfile);

    // Also store a lookup by user number for easy admin access
    await kv.set(`user:number:${newUserNumber}`, {
      userId: authData.user.id,
      email,
      name,
      tier,
      createdAt: userProfile.createdAt
    });

    console.log(`New user registered: #${newUserNumber} (${tier}) - ${email}`);

    return c.json({ 
      success: true, 
      user: authData.user,
      userNumber: newUserNumber,
      tier,
      tierDescription,
      message: 'Account created successfully'
    });
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get user profile
app.get('/make-server-d32880b0/user/profile', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    // Return early for demo/invalid tokens without logging errors
    if (accessToken === 'demo-token') {
      return c.json({ user: null }, 200);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Auth error getting user profile:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userData = await kv.get(`user:${user.id}`);
    return c.json({ user: userData });
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Update user profile
app.put('/make-server-d32880b0/user/profile', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    // Return early for demo/invalid tokens without logging errors
    if (accessToken === 'demo-token') {
      return c.json({ user: null }, 200);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      console.error('Auth error updating user profile:', error);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const updates = await c.req.json();
    const existingData = await kv.get(`user:${user.id}`) || {};
    
    const updatedData = {
      ...existingData,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`user:${user.id}`, updatedData);
    return c.json({ success: true, user: updatedData });
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== CYCLE TRACKING ====================

// Save cycle data
app.post('/make-server-d32880b0/cycle/log', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const cycleData = await c.req.json();
    const entryId = `cycle:${user.id}:${Date.now()}`;
    
    await kv.set(entryId, {
      userId: user.id,
      ...cycleData,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, id: entryId });
  } catch (error) {
    console.error('Cycle log error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get cycle history
app.get('/make-server-d32880b0/cycle/history', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const entries = await kv.getByPrefix(`cycle:${user.id}:`);
    return c.json({ entries: entries.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) });
  } catch (error) {
    console.error('Cycle history error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== TASK MANAGEMENT ====================

// Create task
app.post('/make-server-d32880b0/tasks', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const taskData = await c.req.json();
    const taskId = `task:${user.id}:${Date.now()}`;
    
    const task = {
      id: taskId,
      userId: user.id,
      ...taskData,
      completed: false,
      createdAt: new Date().toISOString()
    };

    await kv.set(taskId, task);
    return c.json({ success: true, task });
  } catch (error) {
    console.error('Create task error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get all tasks
app.get('/make-server-d32880b0/tasks', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tasks = await kv.getByPrefix(`task:${user.id}:`);
    return c.json({ tasks });
  } catch (error) {
    console.error('Get tasks error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Update task
app.put('/make-server-d32880b0/tasks/:taskId', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const taskId = c.req.param('taskId');
    const updates = await c.req.json();
    
    const existingTask = await kv.get(taskId);
    if (!existingTask || existingTask.userId !== user.id) {
      return c.json({ error: 'Task not found' }, 404);
    }

    const updatedTask = {
      ...existingTask,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await kv.set(taskId, updatedTask);
    return c.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('Update task error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Delete task
app.delete('/make-server-d32880b0/tasks/:taskId', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const taskId = c.req.param('taskId');
    const existingTask = await kv.get(taskId);
    
    if (!existingTask || existingTask.userId !== user.id) {
      return c.json({ error: 'Task not found' }, 404);
    }

    await kv.del(taskId);
    return c.json({ success: true });
  } catch (error) {
    console.error('Delete task error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== CALENDAR INTEGRATION ====================

// Save calendar connections
app.post('/make-server-d32880b0/calendar/connect', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { calendars } = await c.req.json();
    await kv.set(`calendar:${user.id}`, {
      userId: user.id,
      calendars,
      updatedAt: new Date().toISOString()
    });

    return c.json({ success: true });
  } catch (error) {
    console.error('Calendar connect error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get calendar connections
app.get('/make-server-d32880b0/calendar/connections', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const calendarData = await kv.get(`calendar:${user.id}`);
    return c.json({ calendars: calendarData?.calendars || [] });
  } catch (error) {
    console.error('Get calendar connections error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== ENERGY & INSIGHTS ====================

// Log energy data
app.post('/make-server-d32880b0/energy/log', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const energyData = await c.req.json();
    const entryId = `energy:${user.id}:${Date.now()}`;
    
    await kv.set(entryId, {
      userId: user.id,
      ...energyData,
      createdAt: new Date().toISOString()
    });

    return c.json({ success: true, id: entryId });
  } catch (error) {
    console.error('Energy log error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get energy history
app.get('/make-server-d32880b0/energy/history', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const limit = parseInt(c.req.query('limit') || '30');
    const entries = await kv.getByPrefix(`energy:${user.id}:`);
    
    return c.json({ 
      entries: entries
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, limit)
    });
  } catch (error) {
    console.error('Energy history error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

Deno.serve(app.fetch);
