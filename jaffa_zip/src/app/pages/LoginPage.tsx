import { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { GiSmartphone, GiReturnArrow } from 'react-icons/gi';
import { useGame } from '../context/GameContext';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Input } from '../components/ui/input';
import jaffaLogo from 'figma:asset/664ae28598058626f6f581874440c5d6683e5706.png';

export default function LoginPage() {
  const navigate = useNavigate();
  const { dispatch } = useGame();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [step, setStep] = useState<'phone' | 'code' | 'name'>('phone');
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);
  const [mockMode, setMockMode] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.length < 10) {
      toast.error('Please enter a valid phone number');
      return;
    }
    setLoading(true);
    try {
      await api.sendOtp(phone);
      setStep('code');
      setMockMode(true);
      toast.success('OTP sent to your phone');
      let timeLeft = 60;
      const interval = setInterval(() => {
        timeLeft--;
        setTimer(timeLeft);
        if (timeLeft <= 0) clearInterval(interval);
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    try {
      const response = await api.verifyOtp(phone, code, displayName || undefined);
      if (response.needsDisplayName) {
        setStep('name');
      } else {
        dispatch({ type: 'SET_TOKEN', payload: response.token });
        dispatch({ type: 'SET_USER', payload: response.user });
        toast.success('Welcome to Jaffa!');
        const savedVenueId = localStorage.getItem('venueId');
        const savedMatchId = localStorage.getItem('matchId');
        if (savedVenueId && savedMatchId) navigate(`/match/${savedMatchId}`);
        else navigate('/lobby');
      }
    } catch (error: any) {
      toast.error(error.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleSetName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || displayName.length < 2) {
      toast.error('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      const response = await api.verifyOtp(phone, code, displayName);
      dispatch({ type: 'SET_TOKEN', payload: response.token });
      dispatch({ type: 'SET_USER', payload: response.user });
      toast.success(`Welcome, ${displayName}!`);
      navigate('/lobby');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: '#0d0d0d',
    border: '2px solid #555',
    borderRadius: '4px',
    color: '#fff',
    boxShadow: '3px 3px 0 0 #ff6341',
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0d0d0d' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md"
      >
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors font-bold"
          style={{ background: 'none', border: 'none', boxShadow: 'none' }}
        >
          <GiReturnArrow className="w-5 h-5" fill="currentColor" />
          <span className="text-sm uppercase tracking-wide">Back</span>
        </button>

        {/* Card */}
        <div
          className="p-8"
          style={{
            background: '#1a1a1a',
            border: '3px solid #ff6341',
            borderRadius: '4px',
            boxShadow: '6px 6px 0 0 #ff6341',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <img src={jaffaLogo} alt="JAFFA" className="w-72 md:w-80 mx-auto mb-5" />
            {/* Step label */}
            <div
              className="inline-block px-4 py-1"
              style={{ background: '#222', border: '1px solid #444', borderRadius: '2px' }}
            >
              <p className="text-xs text-white/70 uppercase tracking-wider font-black">
                {step === 'phone' && 'Enter your phone number'}
                {step === 'code' && 'Verify OTP'}
                {step === 'name' && 'Create your profile'}
              </p>
            </div>
          </div>

          {/* Mock Mode Banner */}
          {mockMode && step === 'code' && (
            <div
              className="mb-6 p-4"
              style={{
                background: '#111',
                border: '2px solid #ff6341',
                borderRadius: '4px',
                boxShadow: '3px 3px 0 0 #ff6341',
              }}
            >
              <p className="text-xs text-white/80 text-center font-bold">
                🔧 <span className="text-[#ff6341] font-black">DEMO MODE</span> — Backend not connected
                <br />
                Use OTP: <span className="text-[#ff6341] font-black">123456</span> or{' '}
                <span className="text-[#ff6341] font-black">111111</span>
              </p>
            </div>
          )}

          {/* Phone Step */}
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-white mb-2 uppercase tracking-wide">
                  Phone Number
                </label>
                <div className="relative">
                  <GiSmartphone
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#ff6341]"
                    fill="currentColor"
                  />
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="pl-12 h-14 text-lg uppercase font-bold"
                    style={inputStyle}
                    maxLength={15}
                  />
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full btn-sticker btn-orange h-14 text-lg">
                {loading ? 'SENDING...' : 'SEND OTP'}
              </button>
            </form>
          )}

          {/* Code Step */}
          {step === 'code' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-white mb-2 uppercase tracking-wide">
                  Enter 6-Digit Code
                </label>
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="h-14 text-2xl text-center tracking-widest font-black"
                  style={inputStyle}
                  maxLength={6}
                />
                <p className="text-sm text-white/50 mt-2 text-center font-bold">
                  Code expires in {timer}s
                </p>
              </div>
              <button type="submit" disabled={loading || code.length !== 6} className="w-full btn-sticker btn-orange h-14 text-lg">
                {loading ? 'VERIFYING...' : 'VERIFY'}
              </button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full text-sm text-white/50 hover:text-white uppercase tracking-wider font-bold"
                style={{ background: 'none', border: 'none', boxShadow: 'none' }}
              >
                Change Number
              </button>
            </form>
          )}

          {/* Name Step */}
          {step === 'name' && (
            <form onSubmit={handleSetName} className="space-y-6">
              <div>
                <label className="block text-xs font-black text-white mb-2 uppercase tracking-wide">
                  Your Name
                </label>
                <Input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="h-14 text-lg font-bold"
                  style={inputStyle}
                  maxLength={30}
                />
              </div>
              <button type="submit" disabled={loading} className="w-full btn-sticker btn-orange h-14 text-lg">
                {loading ? 'CREATING...' : 'START PLAYING'}
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}