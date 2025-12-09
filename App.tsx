import { useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { BiometricSetup } from './components/BiometricSetup';
import { PathwayOnboarding } from './components/PathwayOnboarding';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleLogin = (username: string, password: string) => {
    console.log('Logging in:', username);
    
    // Store credentials for biometric login later
    localStorage.setItem('bayb_email', username);
    localStorage.setItem('bayb_password_hint', password); // In production, use secure storage
    
    setIsLoggedIn(true);
    
    // Check if this is first login (no biometric setup yet)
    const hasVoice = localStorage.getItem('bayb_voice_enabled') === 'true';
    const hasFace = localStorage.getItem('bayb_face_enabled') === 'true';
    const hasSeenBiometricSetup = localStorage.getItem('bayb_biometric_setup_seen') === 'true';
    
    if (!hasVoice && !hasFace && !hasSeenBiometricSetup) {
      // First time login - show biometric setup
      setShowBiometricSetup(true);
    } else {
      // Returning user - go straight to onboarding
      setShowOnboarding(true);
    }
  };

  const handleBiometricLogin = (method: 'voice' | 'face') => {
    console.log('Biometric login with:', method);
    // TODO: Implement actual biometric verification
    // For now, just log them in if they have it enabled
    setIsLoggedIn(true);
    setShowOnboarding(true);
  };

  const handleBiometricComplete = (biometricData: { voice: boolean; face: boolean }) => {
    console.log('Biometric setup complete:', biometricData);
    localStorage.setItem('bayb_biometric_setup_seen', 'true');
    setShowBiometricSetup(false);
    setShowOnboarding(true);
  };

  const handleBiometricSkip = () => {
    console.log('Biometric setup skipped');
    localStorage.setItem('bayb_biometric_setup_seen', 'true');
    setShowBiometricSetup(false);
    setShowOnboarding(true);
  };

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return (
      <LoginScreen 
        onLogin={handleLogin} 
        onBiometricLogin={handleBiometricLogin}
      />
    );
  }

  // Show biometric setup after first login
  if (showBiometricSetup) {
    return (
      <BiometricSetup 
        onComplete={handleBiometricComplete}
        onSkip={handleBiometricSkip}
      />
    );
  }

  // Show onboarding after biometric setup (or if skipped)
  if (showOnboarding) {
    return <PathwayOnboarding />;
  }

  return null;
}
