import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Eye, EyeOff, Sparkles, Volume2, VolumeX, Mic, Camera } from 'lucide-react';
import logo from 'figma:asset/dc06e66bfc41b0bc908f84999525af5151c85168.png';
import { speakWithElevenLabs, stopSpeaking as stopElevenLabsSpeaking } from '../utils/elevenlabs-tts';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => void;
  onBiometricLogin?: (method: 'voice' | 'face') => void;
  onSignUp?: () => void;
}

export function LoginScreen({ onLogin, onBiometricLogin, onSignUp }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [hasVoiceEnabled, setHasVoiceEnabled] = useState(false);
  const [hasFaceEnabled, setHasFaceEnabled] = useState(false);
  const [isVoiceLogin, setIsVoiceLogin] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');

  // BAYB speaks welcome message on load
  useEffect(() => {
    const timer = setTimeout(() => {
      speak("Welcome BAYB!");
    }, 1000);
    
    // Check if biometric is available
    const voiceEnabled = localStorage.getItem('bayb_voice_enabled') === 'true';
    const faceEnabled = localStorage.getItem('bayb_face_enabled') === 'true';
    setHasVoiceEnabled(voiceEnabled);
    setHasFaceEnabled(faceEnabled);
    
    return () => {
      clearTimeout(timer);
      stopElevenLabsSpeaking();
    };
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    
    setIsLoading(true);
    // Simulate login delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    onLogin(username, password);
    setIsLoading(false);
  };

  const handleVoiceLogin = () => {
    if (onBiometricLogin) {
      onBiometricLogin('voice');
    }
  };

  const handleFaceLogin = () => {
    if (onBiometricLogin) {
      onBiometricLogin('face');
    }
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

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="mb-12"
        >
          <img src={logo} alt="BAYB" className="w-[512px] h-[512px] object-contain" />
        </motion.div>

        {/* Login form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          onSubmit={handleSubmit}
          className="w-full max-w-md space-y-6"
        >
          {/* Username input */}
          <div>
            <label htmlFor="username" className="block text-sm mb-2 text-neutral-300">
              Username or Email
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all"
              placeholder="Enter your username"
              autoComplete="username"
            />
          </div>

          {/* Password input */}
          <div>
            <label htmlFor="password" className="block text-sm mb-2 text-neutral-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-900/50 border border-neutral-800 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 transition-all pr-12"
                placeholder="Enter your password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-amber-500 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" />
                ) : (
                  <Eye className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Forgot password link */}
          <div className="text-right">
            <button
              type="button"
              className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Forgot password?
            </button>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={!username || !password || isLoading}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl text-black font-medium hover:from-amber-600 hover:to-amber-700 transition-all duration-300 shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Sparkles className="w-5 h-5" />
                </motion.div>
                Logging in...
              </span>
            ) : (
              'Log In'
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/0 via-cyan-400/20 to-cyan-400/0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          {/* Sign up link */}
          <div className="text-center pt-4">
            <p className="text-neutral-400 text-sm">
              Visit{' '}
              <a
                href="https://www.bayb.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 hover:text-amber-400 transition-colors font-medium"
              >
                www.BAYB.app
              </a>
            </p>
          </div>
        </motion.form>

        {/* Biometric login options */}
        {(hasVoiceEnabled || hasFaceEnabled) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex gap-4 justify-center mt-8"
          >
            {hasVoiceEnabled && (
              <button
                type="button"
                onClick={handleVoiceLogin}
                className="flex items-center gap-2 px-6 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl hover:bg-amber-500/20 hover:border-amber-500/50 transition-all text-amber-500"
              >
                <Mic className="w-5 h-5" />
                <span>Voice Login</span>
              </button>
            )}
            {hasFaceEnabled && (
              <button
                type="button"
                onClick={handleFaceLogin}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-400/10 border border-cyan-400/30 rounded-xl hover:bg-cyan-400/20 hover:border-cyan-400/50 transition-all text-cyan-400"
              >
                <Camera className="w-5 h-5" />
                <span>Face Login</span>
              </button>
            )}
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center text-neutral-500 text-sm"
        >
          <p>Hormone-Aware Life's COO - Built for Real Women</p>
        </motion.div>
      </div>
    </div>
  );
}
