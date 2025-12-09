// BAYB Onboarding Server Endpoints
// File: /supabase/functions/server/onboarding.tsx
// Progressive answer saving and completion tracking

import { Hono } from 'npm:hono@4';
import * as kv from './kv_store';

const onboarding = new Hono();

onboarding.post('/save', async (c) => {
  try {
    const { userId, field, value, allAnswers } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    await kv.set(`user:${userId}:onboarding_answers`, allAnswers);

    await kv.set(`user:${userId}:onboarding:${field}`, value);

    console.log(`Saved onboarding answer for user ${userId}, field: ${field}`);

    return c.json({ 
      success: true,
      message: 'Answer saved successfully' 
    });
  } catch (error) {
    console.error('Error saving onboarding answer:', error);
    return c.json({ 
      error: 'Failed to save answer',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

onboarding.post('/complete', async (c) => {
  try {
    const { userId, onboardingData } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    await kv.set(`user:${userId}:onboarding_answers`, onboardingData);

    await kv.set(`user:${userId}:onboarding_complete`, true);

    await kv.set(`user:${userId}:onboarding_completed_at`, new Date().toISOString());

    console.log(`Onboarding completed for user ${userId}`);

    return c.json({ 
      success: true,
      message: 'Onboarding completed successfully',
      onboardingComplete: true
    });
  } catch (error) {
    console.error('Error completing onboarding:', error);
    return c.json({ 
      error: 'Failed to complete onboarding',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

onboarding.get('/status/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const isComplete = await kv.get(`user:${userId}:onboarding_complete`);
    const answers = await kv.get(`user:${userId}:onboarding_answers`);

    return c.json({ 
      onboardingComplete: isComplete === true,
      hasAnswers: !!answers,
      answers: answers || {}
    });
  } catch (error) {
    console.error('Error checking onboarding status:', error);
    return c.json({ 
      error: 'Failed to check onboarding status',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

onboarding.get('/data/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      return c.json({ error: 'User ID is required' }, 400);
    }

    const answers = await kv.get(`user:${userId}:onboarding_answers`);

    if (!answers) {
      return c.json({ 
        error: 'No onboarding data found' 
      }, 404);
    }

    return c.json({ 
      success: true,
      data: answers
    });
  } catch (error) {
    console.error('Error fetching onboarding data:', error);
    return c.json({ 
      error: 'Failed to fetch onboarding data',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default onboarding;
