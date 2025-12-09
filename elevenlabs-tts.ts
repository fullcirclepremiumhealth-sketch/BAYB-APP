// BAYB ElevenLabs TTS Utility with Browser Fallback
// File: /utils/elevenlabs-tts.ts
// Handles text-to-speech with ElevenLabs API and automatic fallback to browser TTS

import { projectId, publicAnonKey } from './supabase/info';

export interface TTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  audioEnabled?: boolean;
}

let currentAudioElement: HTMLAudioElement | null = null;

function stopCurrentAudio() {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }
}

function preprocessTextForTTS(text: string): string {
  return text
    .replace(/BAYB/g, 'babe')
    .replace(/\bCOO\b/gi, 'Chief Operating Officer')
    .replace(/Perfect,/g, 'Perfect')
    .replace(/'\./g, '.')
    .replace(/,/g, ',')
    .replace(/[\.?]$/g, '')
    .replace(/\?/g, '?...')
    .replace(/\./g, '...');
}

export async function speakWithElevenLabs(
  text: string,
  options: TTSOptions = {}
): Promise<void> {
  const {
    onStart,
    onEnd,
    onError,
    audioEnabled = true,
  } = options;

  if (!audioEnabled) return;

  stopCurrentAudio();

  try {
    onStart?.();
    
    console.log('🎤 Attempting ElevenLabs TTS...');
    
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/text-to-speech`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify({
          text: preprocessTextForTTS(text),
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ ElevenLabs API error:', response.status, errorData);
      
      if (errorData.voiceId) {
        console.error('❌ Voice ID that failed:', errorData.voiceId);
      }
      if (errorData.details) {
        console.error('❌ Error details:', errorData.details);
      }
      
      throw new Error(`ElevenLabs API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success || !data.audio) {
      throw new Error('Invalid response from ElevenLabs API');
    }
    
    const binaryString = atob(data.audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: data.mimeType || 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    currentAudioElement = audio;
    
    audio.onplay = () => {
      console.log('✅ ElevenLabs TTS playing:', text.substring(0, 50) + '...');
    };
    
    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      currentAudioElement = null;
      onEnd?.();
    };
    
    audio.onerror = (error) => {
      console.error('Audio playback error:', error);
      URL.revokeObjectURL(audioUrl);
      currentAudioElement = null;
      onEnd?.();
    };
    
    await audio.play();
    
  } catch (error) {
    console.warn('⚠️ ElevenLabs failed, falling back to browser TTS:', error);
    onError?.(error as Error);
    
    useBrowserTTS(text, options);
  }
}

function useBrowserTTS(text: string, options: TTSOptions = {}): void {
  const { onStart, onEnd, onError } = options;
  
  if (!('speechSynthesis' in window)) {
    console.warn('⚠️ Browser TTS not supported');
    onError?.(new Error('Browser TTS not supported'));
    onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    
    const startSpeech = () => {
      try {
        const utterance = new SpeechSynthesisUtterance(preprocessTextForTTS(text));
        
        const voices = window.speechSynthesis.getVoices();
        
        const preferredVoice =
          voices.find(v => v.name.includes('Google') && v.lang.includes('en') && v.name.toLowerCase().includes('female')) ||
          voices.find(v => v.lang.includes('en') && v.name.toLowerCase().includes('female')) ||
          voices.find(v => v.name.includes('Samantha')) ||
          voices.find(v => v.name.includes('Victoria')) ||
          voices.find(v => v.lang.includes('en-US')) ||
          voices.find(v => v.lang.includes('en'));

        if (preferredVoice) {
          utterance.voice = preferredVoice;
          console.log(`🎤 Browser TTS using voice: ${preferredVoice.name}`);
        } else {
          console.log('🎤 Browser TTS using default voice');
        }
        
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        utterance.volume = 1.0;
        
        let hasEnded = false;
        
        utterance.onstart = () => {
          console.log('🎤 BAYB speaking (browser TTS):', text.substring(0, 50) + '...');
          onStart?.();
        };
        
        utterance.onend = () => {
          if (!hasEnded) {
            hasEnded = true;
            console.log('✅ Browser TTS finished');
            onEnd?.();
          }
        };
        
        utterance.onerror = (event) => {
          if (!hasEnded) {
            hasEnded = true;
            console.error('❌ Browser TTS error event:', event.error);
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
              onError?.(new Error(`Browser TTS error: ${event.error}`));
            }
            onEnd?.();
          }
        };
        
        window.speechSynthesis.speak(utterance);
        
      } catch (speakError) {
        console.error('❌ Error starting speech:', speakError);
        onError?.(speakError as Error);
        onEnd?.();
      }
    };
    
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      setTimeout(startSpeech, 150);
    } else {
      console.log('⏳ Waiting for voices to load...');
      window.speechSynthesis.onvoiceschanged = () => {
        setTimeout(startSpeech, 150);
      };
      setTimeout(() => {
        if (window.speechSynthesis.getVoices().length === 0) {
          console.warn('⚠️ Voices still not loaded, trying anyway...');
        }
        startSpeech();
      }, 500);
    }
    
  } catch (error) {
    console.error('❌ Browser TTS setup error:', error);
    onError?.(error as Error);
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  stopCurrentAudio();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
