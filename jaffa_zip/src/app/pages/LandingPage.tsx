import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { GiTrophyCup, GiPodiumWinner, GiLightningTrio, GiTwoCoins } from 'react-icons/gi';
import { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import jaffaLogo from 'figma:asset/664ae28598058626f6f581874440c5d6683e5706.png';

const features = [
  { icon: GiTrophyCup,    label: 'LIVE PREDICTIONS', color: '#ff6341' },
  { icon: GiPodiumWinner, label: 'COMPETE',          color: '#ffd60a' },
  { icon: GiLightningTrio,label: 'INSTANT POINTS',   color: '#3b9eff' },
  { icon: GiTwoCoins,     label: 'WIN REWARDS',      color: '#22c55e' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { state } = useGame();
  const [showDemoNotice, setShowDemoNotice] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const venueId = params.get('venueId');
    const matchId = params.get('matchId');
    if (venueId) localStorage.setItem('venueId', venueId);
    if (matchId) localStorage.setItem('matchId', matchId);
    const timer = setTimeout(() => setShowDemoNotice(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const handleEnter = () => {
    if (state.token) navigate('/lobby');
    else navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: '#0d0d0d' }}>
      {/* Corner accents */}
      <div className="absolute top-0 right-0 w-0 h-0"
        style={{ borderLeft: '80px solid transparent', borderTop: '80px solid #ff6341' }} />
      <div className="absolute bottom-0 left-0 w-0 h-0"
        style={{ borderRight: '60px solid transparent', borderBottom: '60px solid #ff6341' }} />
      {/* Accent stripe */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: '#ff6341' }} />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 text-center max-w-4xl w-full"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-10"
        >
          <img
            src={jaffaLogo}
            alt="JAFFA"
            className="w-[260px] sm:w-[360px] md:w-[460px] mx-auto mb-6 max-w-full"
          />
          {/* Tagline — sticker label style */}
          <div className="inline-block">
            <div
              className="px-8 py-3"
              style={{
                background: '#ff6341',
                border: '3px solid #000',
                borderRadius: '3px',
                boxShadow: '6px 6px 0 0 #000',
              }}
            >
              <p className="text-black font-black tracking-widest uppercase" style={{ fontFamily: 'Bungee', fontSize: '1rem' }}>
                PREDICT • COMPETE • WIN
              </p>
            </div>
          </div>
        </motion.div>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-white/70 font-bold mb-10 max-w-xl mx-auto"
        >
          Over-by-over IPL predictions at your favorite venue. Compete on the live leaderboard and win café rewards!
        </motion.p>

        {/* 4-color feature cards — full landscape boxes matching image */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
        >
          {features.map(({ icon: Icon, label, color }) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center gap-4 py-8 px-4"
              style={{
                background: '#1a1a1a',
                border: `2px solid ${color}`,
                borderRadius: '6px',
                boxShadow: `5px 5px 0 0 ${color}`,
                aspectRatio: '4/3',
              }}
            >
              <Icon style={{ color: color, width: '48px', height: '48px' }} fill={color} />
              <p
                className="text-white uppercase text-center"
                style={{ fontFamily: 'Bungee', fontSize: '0.75rem', letterSpacing: '0.04em', lineHeight: 1.2 }}
              >
                {label}
              </p>
            </div>
          ))}
        </motion.div>

        {/* ENTER ARENA — orange sticker button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.88 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="mb-6"
        >
          <button
            onClick={handleEnter}
            className="btn-sticker btn-orange px-14 py-5 text-2xl"
            style={{ fontFamily: 'Bungee', minWidth: '280px' }}
          >
            ENTER ARENA
          </button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-sm text-white/35 font-bold"
        >
          No app download • No hardware • Zero friction
        </motion.p>

        {/* Demo notice */}
        {showDemoNotice && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 max-w-sm mx-auto"
          >
            <div
              className="p-4"
              style={{
                background: '#1a1a1a',
                border: '2px solid #ff6341',
                borderRadius: '4px',
                boxShadow: '4px 4px 0 0 #ff6341',
              }}
            >
              <p className="text-xs text-white/60 font-bold">
                🔧 <span className="text-[#ff6341]">DEMO MODE</span> — Backend not connected.{' '}
                Full UI available for testing!
              </p>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}