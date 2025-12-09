// BAYB ElevenLabs Diagnostic Test Component
// File: /components/ElevenLabsVoiceTest.tsx
// Comprehensive voice validation and testing tools

import { useState } from 'react';
import { Volume2, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

export function ElevenLabsVoiceTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [voices, setVoices] = useState<any>(null);
  const [currentConfig, setCurrentConfig] = useState<any>(null);

  useState(() => {
    fetchCurrentConfig();
  });

  const fetchCurrentConfig = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/config`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCurrentConfig(data);
        console.log('📋 Current config:', data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const validateVoiceId = async (voiceId: string) => {
    setTesting(true);
    setResult(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/validate-voice`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ voiceId })
        }
      );

      const data = await response.json();

      if (data.valid) {
        setResult({
          success: true,
          message: `✅ Voice ID is VALID! Voice name: ${data.voice.name}`
        });
      } else {
        setResult({
          success: false,
          message: `❌ Voice ID is INVALID (${data.status}): ${data.error || 'Voice not found in your account'}`
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  };

  const testVoiceId = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/text-to-speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            text: 'Hello, this is a test of your ElevenLabs voice configuration.'
          })
        }
      );

      const data = await response.json();
      
      if (response.ok && data.success) {
        const binaryString = atob(data.audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
        
        setResult({
          success: true,
          message: 'Voice test successful! Playing audio now.'
        });
      } else {
        setResult({
          success: false,
          message: data.details || data.error || 'Unknown error',
          voiceId: data.voiceId,
          status: response.status
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  };

  const testBrowserTTS = () => {
    setTesting(true);
    setResult(null);
    
    try {
      if (!('speechSynthesis' in window)) {
        setResult({
          success: false,
          message: 'Browser TTS not supported in this browser'
        });
        setTesting(false);
        return;
      }

      window.speechSynthesis.cancel();
      
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(
          'Hello, this is BAYB testing the browser text to speech system.'
        );
        
        const voices = window.speechSynthesis.getVoices();
        const femaleVoice = voices.find(v => 
          v.lang.includes('en') && v.name.toLowerCase().includes('female')
        ) || voices.find(v => v.name.includes('Samantha'));
        
        if (femaleVoice) {
          utterance.voice = femaleVoice;
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        
        utterance.onstart = () => {
          setResult({
            success: true,
            message: `Browser TTS working! Using voice: ${utterance.voice?.name || 'default'}`
          });
        };
        
        utterance.onend = () => {
          setTesting(false);
        };
        
        utterance.onerror = (event) => {
          setResult({
            success: false,
            message: `Browser TTS error: ${event.error}`
          });
          setTesting(false);
        };
        
        window.speechSynthesis.speak(utterance);
        
      }, 150);
      
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      });
      setTesting(false);
    }
  };

  const fetchAvailableVoices = async () => {
    setTesting(true);
    setResult(null);
    
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/voices`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );

      const data = await response.json();
      
      if (response.ok && data.voices) {
        setVoices(data.voices);
        setResult({
          success: true,
          message: `Found ${data.voices.length} voices in your ElevenLabs account. Check below to find your BAYB voice!`
        });
      } else {
        setResult({
          success: false,
          message: 'Failed to fetch voices: ' + (data.error || 'Unknown error')
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-black/90 border border-cyan-500/30 rounded-lg p-4 text-white z-50">
      <h3 className="mb-3 flex items-center gap-2">
        <Volume2 className="w-5 h-5 text-cyan-400" />
        ElevenLabs Voice Test
      </h3>
      
      {currentConfig && (
        <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded text-xs space-y-1">
          <p><span className="text-gray-400">Voice ID:</span> <span className="font-mono text-cyan-400">{currentConfig.voiceId || 'NOT SET'}</span></p>
          <p><span className="text-gray-400">API Key:</span> <span className={currentConfig.hasApiKey ? 'text-green-400' : 'text-red-400'}>{currentConfig.hasApiKey ? 'SET' : 'NOT SET'}</span></p>
          {currentConfig.voiceId && (
            <button
              onClick={() => validateVoiceId(currentConfig.voiceId)}
              disabled={testing}
              className="mt-2 w-full px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded text-xs transition-colors"
            >
              Validate This Voice ID
            </button>
          )}
        </div>
      )}
      
      <div className="flex flex-col gap-2">
        <button
          onClick={testVoiceId}
          disabled={testing}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>Test Current Voice ID</>
          )}
        </button>

        <button
          onClick={testBrowserTTS}
          disabled={testing}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Testing...
            </>
          ) : (
            <>Test Browser TTS</>
          )}
        </button>

        <button
          onClick={fetchAvailableVoices}
          disabled={testing}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {testing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>Show Available Voices</>
          )}
        </button>
      </div>

      {result && (
        <div className={`mt-3 p-3 rounded-lg border ${
          result.success 
            ? 'bg-green-500/10 border-green-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-start gap-2">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm">
              <p className="font-medium mb-1">
                {result.success ? 'Success!' : 'Error'}
              </p>
              <p className="text-gray-300">{result.message}</p>
              {result.voiceId && (
                <p className="text-gray-400 text-xs mt-2">
                  Voice ID: {result.voiceId}
                </p>
              )}
              {result.status && (
                <p className="text-gray-400 text-xs">
                  Status: {result.status}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {voices && (
        <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg max-h-64 overflow-y-auto">
          <p className="font-medium text-sm mb-2">Available Voices ({voices.length}):</p>
          <div className="space-y-2">
            {voices.map((voice: any) => (
              <div key={voice.voice_id} className="text-xs bg-black/40 p-2 rounded">
                <p className="font-medium text-cyan-400">{voice.name}</p>
                <p className="text-gray-400 font-mono text-[10px] mt-1 break-all">
                  ID: {voice.voice_id}
                </p>
                {voice.labels && (
                  <p className="text-gray-500 text-[10px] mt-1">
                    {Object.entries(voice.labels).map(([key, val]) => `${key}: ${val}`).join(', ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
