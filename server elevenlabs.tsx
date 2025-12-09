Perfect! Here's the complete server elevenlabs.tsx code for you to copy:

// BAYB ElevenLabs Server Endpoints
// File: /supabase/functions/server/elevenlabs.tsx
// Server-side ElevenLabs API integration with voice validation

import { Hono } from 'npm:hono';

const app = new Hono();

app.post('/text-to-speech', async (c) => {
  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!apiKey) {
      console.error('❌ ELEVENLABS_API_KEY not found in environment variables');
      return c.json({ 
        error: 'ElevenLabs API key not configured',
        details: 'Please add your ElevenLabs API key in the app settings'
      }, 500);
    }

    const { text, voiceId } = await c.req.json();

    if (!text) {
      return c.json({ error: 'Text is required' }, 400);
    }

    const customVoiceId = Deno.env.get('ELEVENLABS_VOICE_ID');
    
    console.log(`🎤 ElevenLabs TTS request: "${text.substring(0, 50)}..."`);
    console.log(`🔑 ELEVENLABS_VOICE_ID from env: ${customVoiceId || 'NOT SET'}`);
    console.log(`🔑 ELEVENLABS_API_KEY exists: ${!!apiKey}, length: ${apiKey?.length || 0}`);
    
    let selectedVoiceId = voiceId || customVoiceId;
    
    if (!selectedVoiceId) {
      console.log('🔍 No voice ID set, fetching available voices...');
      try {
        const voicesResponse = await fetch('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': apiKey },
        });
        
        if (voicesResponse.ok) {
          const voicesData = await voicesResponse.json();
          if (voicesData.voices && voicesData.voices.length > 0) {
            selectedVoiceId = voicesData.voices[0].voice_id;
            console.log(`✅ Using first available voice: ${voicesData.voices[0].name} (${selectedVoiceId})`);
          }
        }
      } catch (voicesFetchError) {
        console.error('⚠️ Could not fetch voices:', voicesFetchError);
      }
    }
    
    if (!selectedVoiceId) {
      selectedVoiceId = 'EXAVITQu4vr4xnSDxMaL';
      console.log('⚠️ Using hardcoded fallback voice ID');
    }
    
    console.log(`🎤 Attempting TTS with voice ID: ${selectedVoiceId}`);
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.85,
            style: 0.0,
            use_speaker_boost: true,
            speaking_rate: 0.5
          }
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ElevenLabs API error:', response.status, errorText);
      console.error('❌ Voice ID used:', selectedVoiceId);
      console.error('❌ API key exists:', !!apiKey, 'First 10 chars:', apiKey?.substring(0, 10));
      
      if (response.status === 404) {
        console.error('❌ Voice ID not found. This usually means:');
        console.error('   1. The ELEVENLABS_VOICE_ID environment variable has an invalid voice ID');
        console.error('   2. The voice was deleted from your ElevenLabs account');
        console.error('   3. You need to create or clone a voice in ElevenLabs first');
        console.error('   Visit https://elevenlabs.io/app/voice-library to get a valid voice ID');
      }
      
      return c.json({ 
        error: 'ElevenLabs API error', 
        status: response.status,
        details: response.status === 404 
          ? 'Voice ID not found. Please check your ELEVENLABS_VOICE_ID setting.' 
          : errorText,
        voiceId: selectedVoiceId
      }, response.status);
    }

    const audioBuffer = await response.arrayBuffer();
    
    const base64Audio = btoa(
      new Uint8Array(audioBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );

    console.log('✅ ElevenLabs TTS successful, audio length:', audioBuffer.byteLength);

    return c.json({
      success: true,
      audio: base64Audio,
      mimeType: 'audio/mpeg'
    });

  } catch (error) {
    console.error('❌ ElevenLabs TTS error:', error);
    return c.json({ 
      error: 'Failed to generate speech',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

app.get('/voices', async (c) => {
  try {
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!apiKey) {
      return c.json({ error: 'ElevenLabs API key not configured' }, 500);
    }

    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ ElevenLabs voices API error:', errorText);
      return c.json({ error: 'Failed to fetch voices' }, response.status);
    }

    const data = await response.json();
    console.log('✅ Retrieved ElevenLabs voices:', data.voices.length);

    return c.json(data);

  } catch (error) {
    console.error('❌ ElevenLabs voices error:', error);
    return c.json({ 
      error: 'Failed to fetch voices',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

app.get('/config', async (c) => {
  const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID');
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  const hasApiKey = !!apiKey;
  
  console.log('📋 Current ElevenLabs config:');
  console.log('   Voice ID:', voiceId || 'NOT SET');
  console.log('   Voice ID length:', voiceId?.length || 0);
  console.log('   API Key:', hasApiKey ? 'SET' : 'NOT SET');
  console.log('   API Key length:', apiKey?.length || 0);
  console.log('   API Key first 10 chars:', apiKey?.substring(0, 10) || 'N/A');
  
  return c.json({
    voiceId: voiceId || null,
    voiceIdLength: voiceId?.length || 0,
    hasApiKey,
    voiceIdSet: !!voiceId,
    apiKeyLength: apiKey?.length || 0
  });
});

app.post('/validate-voice', async (c) => {
  try {
    const { voiceId } = await c.req.json();
    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!apiKey) {
      return c.json({ error: 'API key not configured' }, 500);
    }

    if (!voiceId) {
      return c.json({ error: 'Voice ID required' }, 400);
    }

    console.log(`🔍 Validating voice ID: ${voiceId}`);

    const response = await fetch(
      `https://api.elevenlabs.io/v1/voices/${voiceId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    );

    if (response.ok) {
      const voiceData = await response.json();
      console.log(`✅ Voice validated: ${voiceData.name}`);
      return c.json({
        valid: true,
        voice: voiceData
      });
    } else {
      const errorText = await response.text();
      console.error(`❌ Voice validation failed (${response.status}):`, errorText);
      return c.json({
        valid: false,
        status: response.status,
        error: errorText
      });
    }
  } catch (error) {
    console.error('❌ Voice validation error:', error);
    return c.json({
      valid: false,
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

export default app;
