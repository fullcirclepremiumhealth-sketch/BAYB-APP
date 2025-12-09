import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Camera, Check, X, Sparkles, Volume2, VolumeX, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import logo from 'figma:asset/dc06e66bfc41b0bc908f84999525af5151c85168.png';
import { speakWithElevenLabs, stopSpeaking as stopElevenLabsSpeaking } from '../utils/elevenlabs-tts';

interface BiometricSetupProps {
  onComplete: (biometricData: { voice: boolean; face: boolean }) => void;
  onSkip: () => void;
}

export function BiometricSetup({ onComplete, onSkip }: BiometricSetupProps) {
  const [step, setStep] = useState<'intro' | 'voice' | 'face' | 'complete'>('intro');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const speak = async (text: string) => {
    if (!audioEnabled) return;
    
    await speakWithElevenLabs(text, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      audioEnabled,
    });
  };

  const stopSpeaking = () => {
    stopElevenLabsSpeaking();
    setIsSpeaking(false);
  };

  const handleVoiceSetup = async () => {
    setStep('voice');
    await speak("Let's set up hands-free voice login. When you're ready, say: BAYB, it's me");
  };

  const startVoiceRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    setIsRecording(true);
    setVoiceTranscript('Listening...');

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      setVoiceTranscript(transcript);

      // Check if transcript matches the passphrase
      if (transcript.includes('bayb') && (transcript.includes("it's me") || transcript.includes('its me'))) {
        setIsProcessing(true);
        
        // Store voice print
        localStorage.setItem('bayb_voice_enabled', 'true');
        localStorage.setItem('bayb_voice_print', JSON.stringify({
          passphrase: transcript,
          timestamp: new Date().toISOString(),
        }));
        
        await speak("Perfect! Voice authentication enabled.");
        
        setTimeout(() => {
          setVoiceEnabled(true);
          setIsProcessing(false);
          setIsRecording(false);
        }, 1500);
      } else {
        setVoiceTranscript('Not recognized. Please say: "BAYB, it\'s me"');
        setTimeout(() => {
          setIsRecording(false);
        }, 2000);
      }
    };

    recognition.onerror = () => {
      setVoiceTranscript('Error. Please try again.');
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (!voiceEnabled) {
        setIsRecording(false);
      }
    };

    recognition.start();
  };

  const handleFaceSetup = async () => {
    setStep('face');
    await speak("Now let's set up facial recognition for instant login");
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      alert('Camera access denied. Please allow camera access in your browser settings.');
    }
  };

  const captureFace = async () => {
    setIsProcessing(true);
    
    // Simulate face capture and processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Store face data
    localStorage.setItem('bayb_face_enabled', 'true');
    localStorage.setItem('bayb_face_data', JSON.stringify({
      enrolled: true,
      timestamp: new Date().toISOString(),
    }));
    
    await speak("Brilliant! Facial recognition enabled.");
    
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    setTimeout(() => {
      setFaceEnabled(true);
      setIsProcessing(false);
    }, 1500);
  };

  const handleComplete = async () => {
    setStep('complete');
    
    if (voiceEnabled || faceEnabled) {
      await speak("All set! You can now log in hands-free.");
    }
    
    setTimeout(() => {
      onComplete({ voice: voiceEnabled, face: faceEnabled });
    }, 2000);
  };

  const handleSkip = () => {
    // Stop camera if active
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    stopSpeaking();
    onSkip();
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-amber-950/20" />
      
      {/* Animated background sparkles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-amber-500/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        {/* Audio toggle button - top right */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={() => {
            setAudioEnabled(!audioEnabled);
            if (isSpeaking && !audioEnabled) {
              stopSpeaking();
            }
          }}
          className="fixed top-6 right-6 p-3 rounded-full bg-neutral-900/50 border border-neutral-800 hover:border-amber-500/50 transition-all z-20"
        >
          {isSpeaking ? (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              <Volume2 className="w-5 h-5 text-amber-500" />
            </motion.div>
          ) : audioEnabled ? (
            <Volume2 className="w-5 h-5 text-neutral-400" />
          ) : (
            <VolumeX className="w-5 h-5 text-neutral-600" />
          )}
        </motion.button>

        {/* Skip button - top left */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={handleSkip}
          className="fixed top-6 left-6 px-4 py-2 rounded-full bg-neutral-900/50 border border-neutral-800 hover:border-cyan-400/50 text-neutral-400 hover:text-cyan-400 transition-all z-20 text-sm"
        >
          Skip for now
        </motion.button>

        <AnimatePresence mode="wait">
          {/* Intro Screen */}
          {step === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl text-center space-y-8"
            >
              <motion.img
                src={logo}
                alt="BAYB"
                className="w-64 h-64 mx-auto object-contain"
                animate={{
                  scale: [1, 1.05, 1],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                }}
              />
              
              <div className="space-y-4">
                <h1 className="text-4xl text-amber-500">Welcome to BAYB!</h1>
                <p className="text-xl text-neutral-300">
                  Let's make your life easier with hands-free login
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mt-12">
                {/* Voice Setup Card */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-2xl space-y-4 cursor-pointer hover:border-amber-500/50 transition-all"
                  onClick={handleVoiceSetup}
                >
                  <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-full flex items-center justify-center">
                    <Mic className="w-8 h-8 text-amber-500" />
                  </div>
                  <h3 className="text-xl text-amber-500">Voice Login</h3>
                  <p className="text-neutral-400 text-sm">
                    Just say "BAYB, it's me" to log in instantly
                  </p>
                </motion.div>

                {/* Face Setup Card */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  className="p-8 bg-neutral-900/50 border border-neutral-800 rounded-2xl space-y-4 cursor-pointer hover:border-cyan-400/50 transition-all"
                  onClick={handleFaceSetup}
                >
                  <div className="w-16 h-16 mx-auto bg-cyan-400/10 rounded-full flex items-center justify-center">
                    <Camera className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h3 className="text-xl text-cyan-400">Facial Recognition</h3>
                  <p className="text-neutral-400 text-sm">
                    Look at your camera for instant secure login
                  </p>
                </motion.div>
              </div>

              <Button
                onClick={handleComplete}
                className="mt-8 px-8 py-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black rounded-xl"
              >
                Continue
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>
          )}

          {/* Voice Setup Screen */}
          {step === 'voice' && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl text-center space-y-8"
            >
              <motion.div
                className={`w-48 h-48 mx-auto rounded-full flex items-center justify-center ${
                  isRecording ? 'bg-amber-500/20' : 'bg-neutral-900/50'
                } border-4 ${
                  voiceEnabled ? 'border-green-500' : isRecording ? 'border-amber-500' : 'border-neutral-800'
                }`}
                animate={isRecording ? {
                  scale: [1, 1.1, 1],
                } : {}}
                transition={{
                  duration: 1.5,
                  repeat: isRecording ? Infinity : 0,
                }}
              >
                {voiceEnabled ? (
                  <Check className="w-24 h-24 text-green-500" />
                ) : (
                  <Mic className={`w-24 h-24 ${isRecording ? 'text-amber-500' : 'text-neutral-600'}`} />
                )}
              </motion.div>

              <div className="space-y-4">
                <h2 className="text-3xl text-amber-500">Voice Authentication</h2>
                {!voiceEnabled ? (
                  <>
                    <p className="text-xl text-neutral-300">
                      Say: <span className="text-amber-500">"BAYB, it's me"</span>
                    </p>
                    {voiceTranscript && (
                      <p className="text-cyan-400 text-sm">
                        {voiceTranscript}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xl text-green-400">
                    ✓ Voice authentication enabled!
                  </p>
                )}
              </div>

              {!voiceEnabled && (
                <Button
                  onClick={startVoiceRecording}
                  disabled={isRecording || isProcessing}
                  className="px-8 py-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black rounded-xl disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : isRecording ? (
                    'Listening...'
                  ) : (
                    'Start Recording'
                  )}
                </Button>
              )}

              {voiceEnabled && (
                <div className="flex gap-4 justify-center">
                  <Button
                    onClick={handleFaceSetup}
                    className="px-8 py-6 bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-black rounded-xl"
                  >
                    Set Up Face ID
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                  <Button
                    onClick={handleComplete}
                    variant="outline"
                    className="px-8 py-6 border-neutral-700 text-white hover:border-amber-500/50 rounded-xl"
                  >
                    Done
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* Face Setup Screen */}
          {step === 'face' && (
            <motion.div
              key="face"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl text-center space-y-8"
            >
              <div className="space-y-4">
                <h2 className="text-3xl text-cyan-400">Facial Recognition</h2>
                {!faceEnabled ? (
                  <p className="text-xl text-neutral-300">
                    Position your face in the camera
                  </p>
                ) : (
                  <p className="text-xl text-green-400">
                    ✓ Facial recognition enabled!
                  </p>
                )}
              </div>

              <div className="relative w-96 h-96 mx-auto">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover rounded-2xl border-4 border-cyan-400"
                  autoPlay
                  muted
                />
                {faceEnabled && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl"
                  >
                    <Check className="w-32 h-32 text-green-500" />
                  </motion.div>
                )}
              </div>

              {!faceEnabled && (
                <Button
                  onClick={captureFace}
                  disabled={isProcessing}
                  className="px-8 py-6 bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-500 hover:to-cyan-600 text-black rounded-xl disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Sparkles className="w-5 h-5 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    'Capture Face'
                  )}
                </Button>
              )}

              {faceEnabled && (
                <Button
                  onClick={handleComplete}
                  className="px-8 py-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black rounded-xl"
                >
                  Complete Setup
                  <ChevronRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </motion.div>
          )}

          {/* Complete Screen */}
          {step === 'complete' && (
            <motion.div
              key="complete"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-2xl text-center space-y-8"
            >
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 1,
                }}
                className="w-32 h-32 mx-auto bg-green-500/20 rounded-full flex items-center justify-center"
              >
                <Check className="w-16 h-16 text-green-500" />
              </motion.div>

              <div className="space-y-4">
                <h2 className="text-4xl text-amber-500">You're All Set!</h2>
                <p className="text-xl text-neutral-300">
                  {voiceEnabled && faceEnabled
                    ? 'Voice and facial recognition are ready'
                    : voiceEnabled
                    ? 'Voice recognition is ready'
                    : faceEnabled
                    ? 'Facial recognition is ready'
                    : 'You can set these up later in settings'}
                </p>
              </div>

              <div className="flex gap-4 justify-center mt-8">
                {voiceEnabled && (
                  <div className="px-6 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <Mic className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm text-amber-500">Voice Enabled</p>
                  </div>
                )}
                {faceEnabled && (
                  <div className="px-6 py-3 bg-cyan-400/10 border border-cyan-400/30 rounded-xl">
                    <Camera className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
                    <p className="text-sm text-cyan-400">Face ID Enabled</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
