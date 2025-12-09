import { projectId, publicAnonKey } from './supabase/info';

export interface TTSOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  audioEnabled?: boolean;
}

// Global audio element to track currently playing audio
let currentAudioElement: HTMLAudioElement | null = null;

/**
 * Stop any currently playing audio
 */
function stopCurrentAudio() {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.currentTime = 0;
    currentAudioElement = null;
  }
}

/**
 * Preprocess text for better TTS pronunciation
 */
function preprocessTextForTTS(text: string): string {
  return text
    .replace(/BAYB/g, 'babe')
    .replace(/\bCOO\b/gi, 'Chief Operating Officer')  // Say the full title instead of spelling it out
    .replace(/Perfect,/g, 'Perfect') // Remove comma after "Perfect" for smoother flow
    .replace(/'\./g, '.') // Remove apostrophe before period to avoid "uhm" sounds
    .replace(/,/g, ',') // Keep commas as-is for short natural pauses
    .replace(/[\.\\?]$/g, '') // Remove final trailing period or question mark to avoid end breathing
    .replace(/\?/g, '?...') // Add longer pauses with breathing after question marks
    .replace(/\./g, '...'); // Add longer pauses with breathing for mid-sentence periods
}

/**
 * Speak text using ElevenLabs API with the custom voice
 * Falls back to browser TTS if ElevenLabs fails
 */
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

  // CRITICAL: Stop any currently playing audio FIRST
  stopCurrentAudio();

  try {
    onStart?.();

    // Preprocess text for better pronunciation
    const processedText = preprocessTextForTTS(text);

    // Call ElevenLabs API through our server
    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-d32880b0/elevenlabs/text-to-speech`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: processedText,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const { audio, mimeType } = await response.json();

    // Convert base64 to blob and play
    const binaryString = atob(audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const audioUrl = URL.createObjectURL(blob);

    const audioElement = new Audio(audioUrl);
    
    // Track this audio element globally
    currentAudioElement = audioElement;
    
    audioElement.onended = () => {
      onEnd?.();
      URL.revokeObjectURL(audioUrl);
      if (currentAudioElement === audioElement) {
        currentAudioElement = null;
      }
    };
    audioElement.onerror = () => {
      onEnd?.();
      console.error('Error playing ElevenLabs audio');
      if (currentAudioElement === audioElement) {
        currentAudioElement = null;
      }
    };

    await audioElement.play();
  } catch (error) {
    console.error('ElevenLabs TTS error:', error);
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);

    // Fallback to browser TTS if ElevenLabs fails
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(preprocessTextForTTS(text));

      const setVoiceAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice =
          voices.find(
            (v) =>
              v.name.includes('Google') &&
              v.lang.includes('en-GB') &&
              v.name.toLowerCase().includes('female')
          ) || voices.find((v) => v.lang.includes('en-GB'));

        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.rate = 0.95;
        utterance.pitch = 1.2;
        utterance.onstart = () => onStart?.();
        utterance.onend = () => onEnd?.();
        window.speechSynthesis.speak(utterance);
      };

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) setVoiceAndSpeak();
      else window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak;
    }
  }
}

/**
 * Stop any currently playing speech
 */
export function stopSpeaking(): void {
  stopCurrentAudio();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
