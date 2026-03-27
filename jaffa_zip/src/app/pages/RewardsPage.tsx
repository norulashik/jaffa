import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { GiTwoCoins, GiHourglass, GiCheckMark, GiDualityMask } from 'react-icons/gi';
import { useAuth } from '../hooks/useAuth';
import { useCountdown } from '../hooks/useCountdown';
import { api } from '../lib/api';
import { toast } from 'sonner';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';

interface Reward {
  id: string;
  round: number;
  position: number;
  rewardText: string;
  code: string;
  status: 'active' | 'redeemed' | 'expired';
  expiresAt: string;
  createdAt: string;
}

function RewardCard({ reward }: { reward: Reward }) {
  const countdown = useCountdown(reward.status === 'active' ? reward.expiresAt : null);
  const [copied, setCopied] = useState(false);

  const copyCode = () => {
    const fallbackCopy = (text: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(reward.code).catch(() => fallbackCopy(reward.code));
    } else {
      fallbackCopy(reward.code);
    }
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const isActive = reward.status === 'active';
  const isRedeemed = reward.status === 'redeemed';

  const borderColor = isActive ? '#ff6341' : isRedeemed ? '#22c55e' : '#333';
  const shadowColor = isActive ? '#ff6341' : isRedeemed ? '#22c55e' : '#222';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6"
      style={{
        background: '#1a1a1a',
        border: `2px solid ${borderColor}`,
        borderRadius: '4px',
        boxShadow: `4px 4px 0 0 ${shadowColor}`,
        opacity: reward.status === 'expired' ? 0.55 : 1,
      }}
    >
      {/* Status + round */}
      <div className="flex items-center justify-between mb-4">
        <span
          className="px-3 py-1 text-xs font-black uppercase"
          style={{
            background: isActive ? '#ff6341' : isRedeemed ? '#22c55e' : '#222',
            color: isActive || isRedeemed ? '#000' : 'rgba(255,255,255,0.4)',
            border: `2px solid ${isActive ? '#000' : isRedeemed ? '#000' : '#444'}`,
            borderRadius: '2px',
            boxShadow: isActive || isRedeemed ? '2px 2px 0 0 #000' : 'none',
          }}
        >
          {isActive && '● ACTIVE'}
          {isRedeemed && '✓ REDEEMED'}
          {reward.status === 'expired' && 'EXPIRED'}
        </span>
        <span
          className="text-xs font-black px-2 py-0.5"
          style={{ background: '#111', border: '1px solid #333', borderRadius: '2px', color: 'rgba(255,255,255,0.5)' }}
        >
          ROUND {reward.round} • #{reward.position}
        </span>
      </div>

      {/* Reward details */}
      <div className="mb-4">
        <div className="flex items-start gap-3 mb-3">
          <GiTwoCoins className="w-7 h-7 text-[#ffd60a] flex-shrink-0 mt-0.5" fill="currentColor" />
          <div>
            <h3 className="text-xl font-black text-white mb-1" style={{ fontFamily: 'Bungee' }}>
              {reward.rewardText}
            </h3>
            {isActive && !countdown.isExpired && (
              <div className="flex items-center gap-2 text-sm text-white/50 font-bold">
                <GiHourglass className="w-4 h-4" fill="currentColor" />
                <span>Expires in {countdown.formatted}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Code box */}
      {reward.status !== 'expired' && (
        <div
          className="p-4"
          style={{ background: '#0d0d0d', border: '2px solid #333', borderRadius: '4px' }}
        >
          <p className="text-xs text-white/40 uppercase mb-2 font-black">Redemption Code</p>
          <div className="flex items-center justify-between">
            <code
              className="text-2xl font-mono font-black"
              style={{ color: '#ff6341', letterSpacing: '0.1em' }}
            >
              {reward.code}
            </code>
            <button
              onClick={copyCode}
              className="p-2"
              style={{
                background: '#1a1a1a',
                border: '2px solid #333',
                borderRadius: '4px',
                boxShadow: '2px 2px 0 0 #333',
              }}
            >
              {copied ? (
                <GiCheckMark className="w-5 h-5 text-[#22c55e]" fill="currentColor" />
              ) : (
                <GiDualityMask className="w-5 h-5 text-white/60" fill="currentColor" />
              )}
            </button>
          </div>
        </div>
      )}

      {isActive && (
        <p className="text-xs text-white/40 mt-3 font-bold">
          Show this code to venue staff to redeem your reward
        </p>
      )}
    </motion.div>
  );
}

export default function RewardsPage() {
  useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRewards();
  }, []);

  const loadRewards = async () => {
    try {
      const data = await api.getMyRewards();
      const sorted = data.sort((a: Reward, b: Reward) => {
        const order = { active: 1, redeemed: 2, expired: 3 };
        return order[a.status] - order[b.status];
      });
      setRewards(sorted);
    } catch (error: any) {
      toast.error('Failed to load rewards');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0d' }}>
      <Header />

      <main className="flex-1 p-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          <div className="mb-8 mt-4">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-1">
              YOUR <span className="text-[#ff6341]">REWARDS</span>
            </h1>
            <div
              className="h-1 w-24 mt-2"
              style={{ background: '#ff6341', boxShadow: '2px 2px 0 0 #000' }}
            />
            <p className="text-white/50 font-bold mt-3">Redeem your winnings at the venue</p>
          </div>

          {loading && (
            <div
              className="p-8 text-center"
              style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
            >
              <p className="text-white/50 font-bold">Loading rewards...</p>
            </div>
          )}

          {!loading && rewards.length === 0 && (
            <div
              className="p-12 text-center"
              style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px', boxShadow: '4px 4px 0 0 #ff6341' }}
            >
              <GiTwoCoins className="w-16 h-16 text-[#ffd60a] mx-auto mb-4" fill="currentColor" />
              <h3 className="text-xl font-black text-white mb-2 uppercase">NO REWARDS YET</h3>
              <p className="text-white/50 mb-6 font-bold">Win rounds to earn café rewards!</p>
              <button
                onClick={() => (window.location.href = '/lobby')}
                className="btn-game px-8 py-4"
              >
                JOIN A MATCH
              </button>
            </div>
          )}

          {!loading && rewards.length > 0 && (
            <div className="grid gap-4">
              {rewards.map((reward) => (
                <RewardCard key={reward.id} reward={reward} />
              ))}
            </div>
          )}
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}
