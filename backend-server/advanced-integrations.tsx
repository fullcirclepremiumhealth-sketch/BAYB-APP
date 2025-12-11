import { Hono } from 'npm:hono';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ==================== STRAVA INTEGRATION ====================

// OAuth: Start Strava connection
app.get('/make-server-d32880b0/strava/auth', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    if (!clientId) {
      return c.json({ error: 'Strava not configured. Please add STRAVA_CLIENT_ID to environment variables.' }, 400);
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/strava/callback`;
    const scope = 'read,activity:read_all,profile:read_all';
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${user.id}`;

    return c.json({ authUrl });
  } catch (error) {
    console.error('Strava auth error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// OAuth: Callback from Strava
app.get('/make-server-d32880b0/strava/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const userId = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.json({ error: `Strava authorization failed: ${error}` }, 400);
    }

    if (!code || !userId) {
      return c.json({ error: 'Missing authorization code or user ID' }, 400);
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID');
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET');

    // Exchange code for tokens
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Strava token error:', tokenData);
      return c.json({ error: 'Failed to obtain Strava access token' }, 400);
    }

    // Store tokens
    await kv.set(`strava:tokens:${userId}`, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: tokenData.expires_at,
      athlete: tokenData.athlete,
      connectedAt: new Date().toISOString(),
    });

    // Redirect back to app
    return c.redirect(`${Deno.env.get('SUPABASE_URL')}/strava-connected`);
  } catch (error) {
    console.error('Strava callback error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Sync Strava activities
app.post('/make-server-d32880b0/strava/sync', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tokens = await kv.get(`strava:tokens:${user.id}`);
    if (!tokens) {
      return c.json({ error: 'Strava not connected' }, 400);
    }

    // Get activities from last 30 days
    const after = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    
    const activitiesResponse = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.accessToken}`,
        },
      }
    );

    if (!activitiesResponse.ok) {
      console.error('Strava API error:', await activitiesResponse.text());
      return c.json({ error: 'Failed to fetch Strava activities' }, 400);
    }

    const activities = await activitiesResponse.json();

    // Store activities in BAYB format
    const synced = [];
    for (const activity of activities) {
      const workoutId = `workout:strava:${user.id}:${activity.id}`;
      
      const workout = {
        id: workoutId,
        userId: user.id,
        source: 'strava',
        sourceId: activity.id,
        type: mapStravaType(activity.type),
        name: activity.name,
        date: activity.start_date,
        duration: activity.moving_time, // seconds
        distance: activity.distance, // meters
        calories: activity.calories || 0,
        averageHeartRate: activity.average_heartrate,
        maxHeartRate: activity.max_heartrate,
        averagePace: activity.average_speed, // m/s
        elevationGain: activity.total_elevation_gain,
        kudosCount: activity.kudos_count,
        performanceMetrics: {
          sufferScore: activity.suffer_score,
          averageWatts: activity.average_watts,
          maxWatts: activity.max_watts,
        },
        syncedAt: new Date().toISOString(),
      };

      await kv.set(workoutId, workout);
      synced.push(workout);
    }

    // Update last sync time
    await kv.set(`strava:last_sync:${user.id}`, {
      syncedAt: new Date().toISOString(),
      activityCount: synced.length,
    });

    return c.json({ success: true, synced: synced.length, activities: synced });
  } catch (error) {
    console.error('Strava sync error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== WHOOP INTEGRATION ====================

// OAuth: Start WHOOP connection
app.get('/make-server-d32880b0/whoop/auth', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clientId = Deno.env.get('WHOOP_CLIENT_ID');
    if (!clientId) {
      return c.json({ error: 'WHOOP not configured. Please add WHOOP_CLIENT_ID to environment variables.' }, 400);
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/whoop/callback`;
    const scope = 'read:recovery read:sleep read:workout read:cycles read:profile';
    
    const authUrl = `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${user.id}`;

    return c.json({ authUrl });
  } catch (error) {
    console.error('WHOOP auth error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// OAuth: Callback from WHOOP
app.get('/make-server-d32880b0/whoop/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const userId = c.req.query('state');

    if (!code || !userId) {
      return c.json({ error: 'Missing authorization code or user ID' }, 400);
    }

    const clientId = Deno.env.get('WHOOP_CLIENT_ID');
    const clientSecret = Deno.env.get('WHOOP_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/whoop/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('WHOOP token error:', tokenData);
      return c.json({ error: 'Failed to obtain WHOOP access token' }, 400);
    }

    // Store tokens
    await kv.set(`whoop:tokens:${userId}`, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      connectedAt: new Date().toISOString(),
    });

    return c.redirect(`${Deno.env.get('SUPABASE_URL')}/whoop-connected`);
  } catch (error) {
    console.error('WHOOP callback error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Sync WHOOP data
app.post('/make-server-d32880b0/whoop/sync', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tokens = await kv.get(`whoop:tokens:${user.id}`);
    if (!tokens) {
      return c.json({ error: 'WHOOP not connected' }, 400);
    }

    const headers = {
      'Authorization': `Bearer ${tokens.accessToken}`,
    };

    // Get recovery data (last 7 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    const recoveryResponse = await fetch(
      `https://api.prod.whoop.com/developer/v1/recovery?start=${startDate.toISOString()}&end=${new Date().toISOString()}`,
      { headers }
    );

    // Get sleep data
    const sleepResponse = await fetch(
      `https://api.prod.whoop.com/developer/v1/activity/sleep?start=${startDate.toISOString()}&end=${new Date().toISOString()}`,
      { headers }
    );

    // Get workout data
    const workoutResponse = await fetch(
      `https://api.prod.whoop.com/developer/v1/activity/workout?start=${startDate.toISOString()}&end=${new Date().toISOString()}`,
      { headers }
    );

    const recoveryData = await recoveryResponse.json();
    const sleepData = await sleepResponse.json();
    const workoutData = await workoutResponse.json();

    // Store in BAYB format
    const syncedData = {
      recovery: [],
      sleep: [],
      workouts: [],
    };

    // Process recovery data (HRV, resting HR, recovery score)
    if (recoveryData.records) {
      for (const record of recoveryData.records) {
        const entryId = `whoop:recovery:${user.id}:${record.cycle_id}`;
        const entry = {
          userId: user.id,
          source: 'whoop',
          date: record.created_at,
          recoveryScore: record.score?.recovery_score,
          hrvRmssd: record.score?.hrv_rmssd_milli,
          restingHeartRate: record.score?.resting_heart_rate,
          skinTempCelsius: record.score?.skin_temp_celsius,
          spo2Percentage: record.score?.spo2_percentage,
          syncedAt: new Date().toISOString(),
        };
        await kv.set(entryId, entry);
        syncedData.recovery.push(entry);
      }
    }

    // Process sleep data
    if (sleepData.records) {
      for (const record of sleepData.records) {
        const entryId = `whoop:sleep:${user.id}:${record.id}`;
        const entry = {
          userId: user.id,
          source: 'whoop',
          date: record.start,
          totalMinutes: record.score?.stage_summary?.total_in_bed_time_milli / 60000,
          sleepEfficiency: record.score?.sleep_efficiency_percentage,
          remMinutes: record.score?.stage_summary?.rem_sleep_duration_milli / 60000,
          deepMinutes: record.score?.stage_summary?.slow_wave_sleep_duration_milli / 60000,
          lightMinutes: record.score?.stage_summary?.light_sleep_duration_milli / 60000,
          awakeMinutes: record.score?.stage_summary?.awake_duration_milli / 60000,
          sleepScore: record.score?.sleep_performance_percentage,
          syncedAt: new Date().toISOString(),
        };
        await kv.set(entryId, entry);
        syncedData.sleep.push(entry);
      }
    }

    // Process workout data
    if (workoutData.records) {
      for (const record of workoutData.records) {
        const entryId = `whoop:workout:${user.id}:${record.id}`;
        const entry = {
          userId: user.id,
          source: 'whoop',
          date: record.start,
          sport: record.sport_id,
          durationMinutes: record.score?.duration_milli / 60000,
          strain: record.score?.strain,
          averageHeartRate: record.score?.average_heart_rate,
          maxHeartRate: record.score?.max_heart_rate,
          kilojoules: record.score?.kilojoule,
          syncedAt: new Date().toISOString(),
        };
        await kv.set(entryId, entry);
        syncedData.workouts.push(entry);
      }
    }

    await kv.set(`whoop:last_sync:${user.id}`, {
      syncedAt: new Date().toISOString(),
      counts: {
        recovery: syncedData.recovery.length,
        sleep: syncedData.sleep.length,
        workouts: syncedData.workouts.length,
      },
    });

    return c.json({ success: true, data: syncedData });
  } catch (error) {
    console.error('WHOOP sync error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== MYFITNESSPAL INTEGRATION ====================

// Note: MyFitnessPal's official API is deprecated. We'll create manual entry system instead.
// Users can manually log nutrition data which is better for BAYB's use case anyway.

app.post('/make-server-d32880b0/nutrition/log', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const nutritionData = await c.req.json();
    const entryId = `nutrition:${user.id}:${Date.now()}`;

    const entry = {
      userId: user.id,
      date: nutritionData.date || new Date().toISOString(),
      calories: nutritionData.calories || 0,
      protein: nutritionData.protein || 0,
      carbs: nutritionData.carbs || 0,
      fat: nutritionData.fat || 0,
      fiber: nutritionData.fiber || 0,
      iron: nutritionData.iron || 0,
      magnesium: nutritionData.magnesium || 0,
      calcium: nutritionData.calcium || 0,
      vitaminD: nutritionData.vitaminD || 0,
      vitaminB6: nutritionData.vitaminB6 || 0,
      vitaminB12: nutritionData.vitaminB12 || 0,
      water: nutritionData.water || 0, // oz
      notes: nutritionData.notes || '',
      source: nutritionData.source || 'manual', // manual, myfitnesspal, cronometer
      createdAt: new Date().toISOString(),
    };

    await kv.set(entryId, entry);

    return c.json({ success: true, entry });
  } catch (error) {
    console.error('Nutrition log error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get nutrition history
app.get('/make-server-d32880b0/nutrition/history', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const entries = await kv.getByPrefix(`nutrition:${user.id}:`);
    
    return c.json({ 
      entries: entries.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    });
  } catch (error) {
    console.error('Nutrition history error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get nutrition insights by cycle phase
app.get('/make-server-d32880b0/nutrition/insights', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const entries = await kv.getByPrefix(`nutrition:${user.id}:`);
    const cycleEntries = await kv.getByPrefix(`cycle:${user.id}:`);

    // Calculate averages by cycle phase
    const byPhase = calculateNutritionByPhase(entries, cycleEntries);

    // Generate recommendations
    const recommendations = generateNutritionRecommendations(byPhase, user.id);

    return c.json({ insights: byPhase, recommendations });
  } catch (error) {
    console.error('Nutrition insights error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== SLACK INTEGRATION ====================

// Diagnostic endpoint to check if Slack credentials are configured
app.get('/make-server-d32880b0/slack/check-config', async (c) => {
  try {
    const clientId = Deno.env.get('SLACK_CLIENT_ID');
    const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    
    console.log('🔧 Environment check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      allEnvVars: Object.keys(Deno.env.toObject()).filter(k => k.includes('SLACK'))
    });
    
    return c.json({
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasSupabaseUrl: !!supabaseUrl,
      clientIdLength: clientId?.length || 0,
      clientSecretLength: clientSecret?.length || 0,
      clientIdPrefix: clientId ? clientId.substring(0, 15) : 'MISSING',
      redirectUri: `${supabaseUrl}/functions/v1/make-server-d32880b0/slack/callback`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Config check error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Check connection status for any service
app.get('/make-server-d32880b0/advanced-integrations/check-connection', async (c) => {
  try {
    const service = c.req.query('service');
    if (!service) {
      return c.json({ error: 'Service parameter required' }, 400);
    }

    // For test/development, use test-user-slack
    const userId = 'test-user-slack';

    const tokens = await kv.get(`${service}:tokens:${userId}`);
    
    if (tokens) {
      return c.json({ connected: true, tokens });
    } else {
      return c.json({ connected: false });
    }
  } catch (error) {
    console.error('Check connection error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// OAuth: Start Slack connection
app.get('/make-server-d32880b0/slack/auth', async (c) => {
  try {
    // For OAuth flow, we accept requests with public anon key and use test user for development
    // The public anon key allows the request to pass Supabase's infrastructure auth check
    const userId = 'test-user-slack';

    const clientId = Deno.env.get('SLACK_CLIENT_ID');
    const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    
    console.log('🔍 Slack OAuth Debug Info:');
    console.log('  - Client ID exists:', !!clientId);
    console.log('  - Client ID (first 10 chars):', clientId ? clientId.substring(0, 10) + '...' : 'MISSING');
    console.log('  - Client Secret exists:', !!clientSecret);
    console.log('  - Supabase URL:', supabaseUrl);
    
    if (!clientId) {
      return c.json({ 
        error: 'Slack not configured. Please add SLACK_CLIENT_ID to environment variables.',
        debug: 'SLACK_CLIENT_ID is missing from Supabase secrets'
      }, 400);
    }
    
    if (!clientSecret) {
      return c.json({ 
        error: 'Slack not configured. Please add SLACK_CLIENT_SECRET to environment variables.',
        debug: 'SLACK_CLIENT_SECRET is missing from Supabase secrets'
      }, 400);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/make-server-d32880b0/slack/callback`;
    const scopes = 'users.profile:write,users.profile:read,dnd:write';
    
    const authUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${userId}`;

    console.log('🟢 Slack OAuth URL generated successfully');
    console.log('  - Redirect URI:', redirectUri);
    console.log('  - Scopes:', scopes);
    console.log('  - Auth URL:', authUrl);
    
    return c.json({ 
      authUrl,
      debug: {
        redirectUri,
        clientIdPrefix: clientId.substring(0, 10),
        hasSecret: !!clientSecret
      }
    });
  } catch (error) {
    console.error('❌ Slack auth error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// OAuth: Callback from Slack
app.get('/make-server-d32880b0/slack/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const userId = c.req.query('state');

    if (!code || !userId) {
      return c.json({ error: 'Missing authorization code or user ID' }, 400);
    }

    const clientId = Deno.env.get('SLACK_CLIENT_ID');
    const clientSecret = Deno.env.get('SLACK_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/slack/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok || !tokenData.access_token) {
      console.error('Slack token error:', tokenData);
      return c.json({ error: 'Failed to obtain Slack access token' }, 400);
    }

    // Store tokens
    await kv.set(`slack:tokens:${userId}`, {
      accessToken: tokenData.access_token,
      teamId: tokenData.team?.id,
      teamName: tokenData.team?.name,
      userId: tokenData.authed_user?.id,
      connectedAt: new Date().toISOString(),
    });

    // Redirect back to test page
    return c.redirect(`/?view=slack-test`);
  } catch (error) {
    console.error('Slack callback error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Update Slack status based on energy/cycle
app.post('/make-server-d32880b0/slack/update-status', async (c) => {
  try {
    // For development, use test user ID
    const userId = 'test-user-slack';

    const tokens = await kv.get(`slack:tokens:${userId}`);
    if (!tokens) {
      return c.json({ error: 'Slack not connected' }, 400);
    }

    const { statusText, statusEmoji, duration } = await c.req.json();

    // Update Slack status
    const response = await fetch('https://slack.com/api/users.profile.set', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile: {
          status_text: statusText,
          status_emoji: statusEmoji,
          status_expiration: duration ? Math.floor(Date.now() / 1000) + duration : 0,
        },
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack status update error:', data);
      return c.json({ error: 'Failed to update Slack status' }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Slack update status error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Enable Do Not Disturb
app.post('/make-server-d32880b0/slack/enable-dnd', async (c) => {
  try {
    // For development, use test user ID
    const userId = 'test-user-slack';

    const tokens = await kv.get(`slack:tokens:${userId}`);
    if (!tokens) {
      return c.json({ error: 'Slack not connected' }, 400);
    }

    const { minutes } = await c.req.json();

    const response = await fetch('https://slack.com/api/dnd.setSnooze', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        num_minutes: minutes || 60,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error('Slack DND error:', data);
      return c.json({ error: 'Failed to enable Slack DND' }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Slack enable DND error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== LAB RESULTS MANUAL ENTRY ====================

// Add lab result
app.post('/make-server-d32880b0/labs/add', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const labData = await c.req.json();
    const labId = `lab:${user.id}:${Date.now()}`;

    const labResult = {
      id: labId,
      userId: user.id,
      testDate: labData.testDate || new Date().toISOString(),
      labName: labData.labName || '', // Quest, LabCorp, etc.
      results: labData.results || {},
      notes: labData.notes || '',
      createdAt: new Date().toISOString(),
    };

    await kv.set(labId, labResult);

    return c.json({ success: true, labResult });
  } catch (error) {
    console.error('Lab add error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get lab history
app.get('/make-server-d32880b0/labs/history', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const labs = await kv.getByPrefix(`lab:${user.id}:`);
    
    return c.json({ 
      labs: labs.sort((a, b) => 
        new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
      )
    });
  } catch (error) {
    console.error('Lab history error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get lab insights
app.get('/make-server-d32880b0/labs/insights', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const labs = await kv.getByPrefix(`lab:${user.id}:`);
    const energyEntries = await kv.getByPrefix(`energy:${user.id}:`);
    const cycleEntries = await kv.getByPrefix(`cycle:${user.id}:`);

    // Analyze correlations between labs and symptoms
    const insights = analyzeLabCorrelations(labs, energyEntries, cycleEntries);

    return c.json({ insights });
  } catch (error) {
    console.error('Lab insights error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== OURA RING INTEGRATION ====================

// OAuth: Start Oura connection
app.get('/make-server-d32880b0/oura/auth', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const clientId = Deno.env.get('OURA_CLIENT_ID');
    if (!clientId) {
      return c.json({ error: 'Oura not configured. Please add OURA_CLIENT_ID to environment variables.' }, 400);
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/oura/callback`;
    const scope = 'personal daily heartrate workout tag session spo2 rest_mode_period ring_configuration sleep';
    
    const authUrl = `https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${user.id}`;

    return c.json({ authUrl });
  } catch (error) {
    console.error('Oura auth error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// OAuth: Callback from Oura
app.get('/make-server-d32880b0/oura/callback', async (c) => {
  try {
    const code = c.req.query('code');
    const userId = c.req.query('state');
    const error = c.req.query('error');

    if (error) {
      return c.json({ error: `Oura authorization failed: ${error}` }, 400);
    }

    if (!code || !userId) {
      return c.json({ error: 'Missing authorization code or user ID' }, 400);
    }

    const clientId = Deno.env.get('OURA_CLIENT_ID');
    const clientSecret = Deno.env.get('OURA_CLIENT_SECRET');
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/make-server-d32880b0/oura/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId!,
        client_secret: clientSecret!,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      console.error('Oura token error:', tokenData);
      return c.json({ error: 'Failed to obtain Oura access token' }, 400);
    }

    // Store tokens
    await kv.set(`oura:tokens:${userId}`, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      connectedAt: new Date().toISOString(),
    });

    // Redirect back to app
    return c.redirect(`${Deno.env.get('SUPABASE_URL')}/oura-connected`);
  } catch (error) {
    console.error('Oura callback error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Sync Oura data (sleep, readiness, activity)
app.post('/make-server-d32880b0/oura/sync', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tokens = await kv.get(`oura:tokens:${user.id}`);
    if (!tokens) {
      return c.json({ error: 'Oura not connected' }, 400);
    }

    const headers = {
      'Authorization': `Bearer ${tokens.accessToken}`,
    };

    // Get data from last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = new Date().toISOString().split('T')[0];

    const syncedData = {
      sleep: [],
      readiness: [],
      activity: [],
      heartRate: [],
    };

    // Get Sleep data (v2 API)
    const sleepResponse = await fetch(
      `https://api.ouraring.com/v2/usercollection/sleep?start_date=${startDateStr}&end_date=${endDateStr}`,
      { headers }
    );

    if (sleepResponse.ok) {
      const sleepData = await sleepResponse.json();
      
      if (sleepData.data) {
        for (const record of sleepData.data) {
          const entryId = `oura:sleep:${user.id}:${record.id}`;
          const entry = {
            userId: user.id,
            source: 'oura',
            date: record.day,
            totalSleepDuration: record.total_sleep_duration, // seconds
            efficiency: record.efficiency,
            restless: record.restless,
            deepSleep: record.deep_sleep_duration,
            lightSleep: record.light_sleep_duration,
            remSleep: record.rem_sleep_duration,
            awakeTime: record.awake_time,
            latency: record.latency,
            timing: record.timing,
            avgHeartRate: record.average_heart_rate,
            lowestHeartRate: record.lowest_heart_rate,
            avgHrv: record.average_hrv,
            temperatureDeviation: record.temperature_deviation,
            temperatureTrendDeviation: record.temperature_trend_deviation,
            bedtimeStart: record.bedtime_start,
            bedtimeEnd: record.bedtime_end,
            score: record.score,
            syncedAt: new Date().toISOString(),
          };
          await kv.set(entryId, entry);
          syncedData.sleep.push(entry);
        }
      }
    }

    // Get Readiness data (v2 API)
    const readinessResponse = await fetch(
      `https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${startDateStr}&end_date=${endDateStr}`,
      { headers }
    );

    if (readinessResponse.ok) {
      const readinessData = await readinessResponse.json();
      
      if (readinessData.data) {
        for (const record of readinessData.data) {
          const entryId = `oura:readiness:${user.id}:${record.id}`;
          const entry = {
            userId: user.id,
            source: 'oura',
            date: record.day,
            score: record.score,
            temperatureDeviation: record.temperature_deviation,
            temperatureTrendDeviation: record.temperature_trend_deviation,
            contributors: {
              activityBalance: record.contributors?.activity_balance,
              bodyTemperature: record.contributors?.body_temperature,
              hrvBalance: record.contributors?.hrv_balance,
              previousDayActivity: record.contributors?.previous_day_activity,
              previousNight: record.contributors?.previous_night,
              recoveryIndex: record.contributors?.recovery_index,
              restingHeartRate: record.contributors?.resting_heart_rate,
              sleepBalance: record.contributors?.sleep_balance,
            },
            syncedAt: new Date().toISOString(),
          };
          await kv.set(entryId, entry);
          syncedData.readiness.push(entry);
        }
      }
    }

    // Get Activity data (v2 API)
    const activityResponse = await fetch(
      `https://api.ouraring.com/v2/usercollection/daily_activity?start_date=${startDateStr}&end_date=${endDateStr}`,
      { headers }
    );

    if (activityResponse.ok) {
      const activityData = await activityResponse.json();
      
      if (activityData.data) {
        for (const record of activityData.data) {
          const entryId = `oura:activity:${user.id}:${record.id}`;
          const entry = {
            userId: user.id,
            source: 'oura',
            date: record.day,
            score: record.score,
            activeCalories: record.active_calories,
            totalCalories: record.total_calories,
            steps: record.steps,
            equivalentWalkingDistance: record.equivalent_walking_distance,
            highActivityMetMinutes: record.high_activity_met_minutes,
            mediumActivityMetMinutes: record.medium_activity_met_minutes,
            lowActivityMetMinutes: record.low_activity_met_minutes,
            sedentaryMetMinutes: record.sedentary_met_minutes,
            inactivityAlerts: record.inactivity_alerts,
            avgMetMinutes: record.average_met_minutes,
            restingTime: record.resting_time,
            contributors: {
              meetDailyTargets: record.contributors?.meet_daily_targets,
              moveEveryHour: record.contributors?.move_every_hour,
              recoveryTime: record.contributors?.recovery_time,
              stayActive: record.contributors?.stay_active,
              trainingFrequency: record.contributors?.training_frequency,
              trainingVolume: record.contributors?.training_volume,
            },
            syncedAt: new Date().toISOString(),
          };
          await kv.set(entryId, entry);
          syncedData.activity.push(entry);
        }
      }
    }

    // Get Heart Rate data (v2 API)
    const heartRateResponse = await fetch(
      `https://api.ouraring.com/v2/usercollection/heartrate?start_datetime=${startDate.toISOString()}&end_datetime=${new Date().toISOString()}`,
      { headers }
    );

    if (heartRateResponse.ok) {
      const heartRateData = await heartRateResponse.json();
      
      if (heartRateData.data) {
        // Store daily summary instead of every data point
        const dailyHR: any = {};
        
        for (const record of heartRateData.data) {
          const day = record.timestamp.split('T')[0];
          if (!dailyHR[day]) {
            dailyHR[day] = [];
          }
          dailyHR[day].push(record.bpm);
        }

        for (const [day, bpms] of Object.entries(dailyHR)) {
          const entryId = `oura:heartrate:${user.id}:${day}`;
          const entry = {
            userId: user.id,
            source: 'oura',
            date: day,
            avgBpm: Math.round((bpms as number[]).reduce((a, b) => a + b, 0) / (bpms as number[]).length),
            minBpm: Math.min(...(bpms as number[])),
            maxBpm: Math.max(...(bpms as number[])),
            dataPoints: (bpms as number[]).length,
            syncedAt: new Date().toISOString(),
          };
          await kv.set(entryId, entry);
          syncedData.heartRate.push(entry);
        }
      }
    }

    // Update last sync time
    await kv.set(`oura:last_sync:${user.id}`, {
      syncedAt: new Date().toISOString(),
      counts: {
        sleep: syncedData.sleep.length,
        readiness: syncedData.readiness.length,
        activity: syncedData.activity.length,
        heartRate: syncedData.heartRate.length,
      },
    });

    console.log(`✅ Oura sync complete for user ${user.id}:`, {
      sleep: syncedData.sleep.length,
      readiness: syncedData.readiness.length,
      activity: syncedData.activity.length,
      heartRate: syncedData.heartRate.length,
    });

    return c.json({ 
      success: true, 
      data: syncedData,
      summary: {
        sleep: syncedData.sleep.length,
        readiness: syncedData.readiness.length,
        activity: syncedData.activity.length,
        heartRate: syncedData.heartRate.length,
      }
    });
  } catch (error) {
    console.error('Oura sync error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Get Oura connection status
app.get('/make-server-d32880b0/oura/status', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const tokens = await kv.get(`oura:tokens:${user.id}`);
    const lastSync = await kv.get(`oura:last_sync:${user.id}`);

    return c.json({
      connected: !!tokens,
      connectedAt: tokens?.connectedAt || null,
      lastSync: lastSync?.syncedAt || null,
      dataCounts: lastSync?.counts || null,
    });
  } catch (error) {
    console.error('Oura status error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Disconnect Oura
app.delete('/make-server-d32880b0/oura/disconnect', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
      return c.json({ error: 'No authorization token' }, 401);
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await kv.del(`oura:tokens:${user.id}`);
    await kv.del(`oura:last_sync:${user.id}`);

    return c.json({ success: true, message: 'Oura disconnected successfully' });
  } catch (error) {
    console.error('Oura disconnect error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// ==================== HELPER FUNCTIONS ====================

function mapStravaType(stravaType: string): string {
  const mapping: any = {
    'Run': 'running',
    'Ride': 'cycling',
    'Swim': 'swimming',
    'Walk': 'walking',
    'Hike': 'hiking',
    'Yoga': 'yoga',
    'Workout': 'strength',
    'WeightTraining': 'strength',
  };
  return mapping[stravaType] || 'other';
}

function calculateNutritionByPhase(nutritionEntries: any[], cycleEntries: any[]) {
  const byPhase: any = {
    menstrual: { calories: [], protein: [], iron: [], magnesium: [] },
    follicular: { calories: [], protein: [], iron: [], magnesium: [] },
    ovulation: { calories: [], protein: [], iron: [], magnesium: [] },
    luteal: { calories: [], protein: [], iron: [], magnesium: [] },
  };

  nutritionEntries.forEach(entry => {
    const phase = determinePhase(entry.date, cycleEntries);
    if (phase && byPhase[phase]) {
      byPhase[phase].calories.push(entry.calories);
      byPhase[phase].protein.push(entry.protein);
      byPhase[phase].iron.push(entry.iron);
      byPhase[phase].magnesium.push(entry.magnesium);
    }
  });

  // Calculate averages
  Object.keys(byPhase).forEach(phase => {
    byPhase[phase] = {
      avgCalories: calculateAverage(byPhase[phase].calories),
      avgProtein: calculateAverage(byPhase[phase].protein),
      avgIron: calculateAverage(byPhase[phase].iron),
      avgMagnesium: calculateAverage(byPhase[phase].magnesium),
      count: byPhase[phase].calories.length,
    };
  });

  return byPhase;
}

function generateNutritionRecommendations(byPhase: any, userId: string) {
  const recommendations = [];

  // Evidence-based nutrition recommendations by phase
  if (byPhase.menstrual.avgIron < 15) {
    recommendations.push({
      phase: 'menstrual',
      type: 'iron',
      message: 'Your iron intake is low during your period. Aim for 18mg/day. Try red meat, spinach, or fortified cereals.',
      evidence: 'Women lose 15-30mg of iron during menstruation (NIH, 2021)',
    });
  }

  if (byPhase.luteal.avgCalories < byPhase.follicular.avgCalories + 100) {
    recommendations.push({
      phase: 'luteal',
      type: 'calories',
      message: 'Your body needs 150-300 extra calories during luteal phase. Don\'t restrict - fuel your metabolism!',
      evidence: 'BMR increases 2.5-11% during luteal phase (AJCN, 2019)',
    });
  }

  if (byPhase.luteal.avgMagnesium < 300) {
    recommendations.push({
      phase: 'luteal',
      type: 'magnesium',
      message: 'Magnesium reduces PMS symptoms. Aim for 400mg/day. Try dark chocolate, nuts, or leafy greens!',
      evidence: 'Magnesium supplementation reduces PMS symptoms by 40% (CINAHL, 2020)',
    });
  }

  return recommendations;
}

function analyzeLabCorrelations(labs: any[], energyEntries: any[], cycleEntries: any[]) {
  const insights = [];

  // Get most recent lab
  if (labs.length === 0) {
    return [{
      type: 'no_data',
      message: 'No lab results yet. Add your latest blood test to get personalized insights!',
    }];
  }

  const latestLab = labs.sort((a, b) => 
    new Date(b.testDate).getTime() - new Date(a.testDate).getTime()
  )[0];

  // Analyze iron levels vs fatigue
  if (latestLab.results.iron || latestLab.results.ferritin) {
    const ironValue = latestLab.results.iron || latestLab.results.ferritin;
    const avgEnergy = energyEntries.length > 0 
      ? energyEntries.reduce((sum, e) => sum + (e.level || 50), 0) / energyEntries.length 
      : 50;

    if (ironValue < 30 && avgEnergy < 50) {
      insights.push({
        type: 'iron_fatigue',
        severity: 'high',
        message: `Your ferritin is ${ironValue} ng/mL (low) and your average energy is ${Math.round(avgEnergy)}%. Low iron is likely causing your fatigue.`,
        recommendation: 'Talk to your doctor about iron supplementation. Typical dose is 65mg elemental iron daily.',
        evidence: 'Ferritin <30 ng/mL is associated with fatigue even without anemia (PubMed, 2018)',
      });
    }
  }

  // Analyze Vitamin D vs mood/energy
  if (latestLab.results.vitaminD) {
    const vitD = latestLab.results.vitaminD;
    
    if (vitD < 30) {
      insights.push({
        type: 'vitamin_d',
        severity: vitD < 20 ? 'high' : 'medium',
        message: `Your Vitamin D is ${vitD} ng/mL (${vitD < 20 ? 'deficient' : 'insufficient'}). This can worsen PMS and fatigue.`,
        recommendation: `Supplement with ${vitD < 20 ? '5,000' : '2,000'} IU daily. Retest in 3 months.`,
        evidence: 'Vitamin D deficiency correlates with PMS severity (CINAHL, 2019)',
      });
    }
  }

  // Analyze thyroid vs cycle irregularity
  if (latestLab.results.TSH) {
    const tsh = latestLab.results.TSH;
    
    if (tsh > 4.5 || tsh < 0.4) {
      insights.push({
        type: 'thyroid',
        severity: 'high',
        message: `Your TSH is ${tsh} (${tsh > 4.5 ? 'high' : 'low'}). Thyroid issues can mimic or worsen cycle symptoms.`,
        recommendation: 'See an endocrinologist. Your fatigue/irregularity might not be cycle-related.',
        evidence: 'Subclinical hypothyroidism (TSH 4.5-10) affects 15% of women and causes fatigue, irregular cycles (NIH, 2020)',
      });
    }
  }

  return insights;
}

function determinePhase(date: string, cycleEntries: any[]) {
  const sorted = cycleEntries.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  if (sorted.length === 0) return 'follicular';
  
  const lastPeriod = new Date(sorted[0].createdAt);
  const currentDate = new Date(date);
  const daysSince = Math.floor(
    (currentDate.getTime() - lastPeriod.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSince <= 5) return 'menstrual';
  if (daysSince <= 13) return 'follicular';
  if (daysSince <= 16) return 'ovulation';
  return 'luteal';
}

function calculateAverage(arr: number[]) {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export default app;
