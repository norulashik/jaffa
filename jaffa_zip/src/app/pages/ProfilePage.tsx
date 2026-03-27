import { useState } from 'react';
import { motion } from 'motion/react';
import { GiPlayerNext, GiLightningTrio, GiTrophyCup, GiExitDoor, GiCrystalBall } from 'react-icons/gi';
import { useNavigate } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { useGame } from '../context/GameContext';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';

/* Stat card config — each uses one of the 4 accent colors */
const inputStyle = {
  background: '#0d0d0d',
  border: '2px solid #555',
  borderRadius: '4px',
  color: '#fff',
  boxShadow: '3px 3px 0 0 #ff6341',
};

export default function ProfilePage() {
  useAuth();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(state.user?.displayName || '');

  const handleSave = () => {
    if (!displayName || displayName.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }
    toast.success('Profile updated!');
    setEditing(false);
  };

  const handleLogout = () => {
    dispatch({ type: 'RESET' });
    toast.success('Logged out successfully');
    navigate('/');
  };

  const accuracy =
    state.totalPredictions > 0
      ? Math.round((state.correctPredictions / state.totalPredictions) * 100)
      : 0;

  /* 4-color stat tiles */
  const stats = [
    {
      icon: GiTrophyCup,
      value: state.totalPoints,
      label: 'Total Points',
      accent: '#ffd60a',    // yellow
      bg: '#1a1600',
      border: '#2a2200',
      textColor: '#ffd60a',
    },
    {
      icon: GiLightningTrio,
      value: state.bestStreak,
      label: 'Best Streak',
      accent: '#3b9eff',    // blue
      bg: '#001222',
      border: '#001830',
      textColor: '#3b9eff',
    },
    {
      icon: GiPlayerNext,
      value: `${accuracy}%`,
      label: 'Accuracy',
      accent: '#22c55e',    // green
      bg: '#001a0a',
      border: '#002210',
      textColor: '#22c55e',
    },
    {
      icon: GiCrystalBall,
      value: state.totalPredictions,
      label: 'Predictions',
      accent: '#ff6341',    // orange
      bg: '#1a0800',
      border: '#220b00',
      textColor: '#ff6341',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0d' }}>
      <Header />

      <main className="flex-1 p-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Page title */}
          <div className="mb-8 mt-4">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-1">
              YOUR <span className="text-[#ff6341]">PROFILE</span>
            </h1>
            <div className="h-1 w-24 mt-2" style={{ background: '#ff6341', boxShadow: '2px 2px 0 0 #000' }} />
          </div>

          {/* Profile Card */}
          <div
            className="p-8 mb-6"
            style={{
              background: '#1a1a1a',
              border: '3px solid #ff6341',
              borderRadius: '4px',
              boxShadow: '7px 7px 0 0 #ff6341',
            }}
          >
            <div className="flex flex-col items-center mb-4">
              <Avatar
                className="w-24 h-24 mb-4"
                style={{ border: '3px solid #ff6341', borderRadius: '4px', boxShadow: '4px 4px 0 0 #000' }}
              >
                <AvatarFallback
                  className="text-black text-3xl font-black"
                  style={{ background: '#ff6341', borderRadius: '0' }}
                >
                  {state.user?.displayName?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>

              {!editing ? (
                <>
                  <h2 className="text-3xl font-black text-white mb-1" style={{ fontFamily: 'Bungee' }}>
                    {state.user?.displayName}
                  </h2>
                  <p className="text-white/50 mb-5 font-bold">{state.user?.phone}</p>
                  <button onClick={() => setEditing(true)} className="btn-secondary px-8 py-3">
                    EDIT PROFILE
                  </button>
                </>
              ) : (
                <div className="w-full max-w-md space-y-4">
                  <div>
                    <label className="block text-xs font-black text-white mb-2 uppercase tracking-wide">
                      Display Name
                    </label>
                    <Input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="h-12 font-bold"
                      style={inputStyle}
                      maxLength={30}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleSave} className="flex-1 btn-game h-12">SAVE</button>
                    <button
                      onClick={() => { setEditing(false); setDisplayName(state.user?.displayName || ''); }}
                      className="flex-1 btn-secondary h-12"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4-color Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {stats.map(({ icon: Icon, value, label, accent, bg, border, textColor }) => (
              <div
                key={label}
                className="p-6 text-center"
                style={{
                  background: bg,
                  border: `2px solid ${border}`,
                  borderRadius: '4px',
                  boxShadow: `5px 5px 0 0 ${accent}`,
                }}
              >
                <Icon className="w-8 h-8 mx-auto mb-3" fill={accent} style={{ color: accent }} />
                <p className="text-3xl font-black mb-1" style={{ fontFamily: 'Bungee', color: textColor }}>
                  {value}
                </p>
                <p className="text-xs text-white/50 uppercase font-black">{label}</p>
              </div>
            ))}
          </div>

          {/* Logout — styled as a bordered btn with press-down */}
          <button
            onClick={handleLogout}
            className="w-full h-14 flex items-center justify-center gap-2 font-black uppercase"
            style={{
              background: '#1a1a1a',
              border: '2px solid #ff6341',
              borderRadius: '4px',
              color: '#ff6341',
              boxShadow: '4px 4px 0 0 #ff6341',
              transition: 'transform 0.08s ease, box-shadow 0.08s ease',
            }}
            onMouseDown={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'translate(4px,4px)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 #ff6341';
            }}
            onMouseUp={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = '';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 0 #ff6341';
            }}
          >
            <GiExitDoor className="w-5 h-5" fill="currentColor" />
            LOGOUT
          </button>
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
