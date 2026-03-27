import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useSearchParams } from 'react-router';
import { getSocket } from '../lib/socket';
import { Trophy, Zap } from 'lucide-react';

export default function TVDisplayPage() {
  const [searchParams] = useSearchParams();
  const venueId = searchParams.get('venueId');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [hypeEvent, setHypeEvent] = useState<any>(null);

  useEffect(() => {
    if (!venueId) return;

    const socket = getSocket();
    socket.emit('joinTV', { venueId });

    socket.on('leaderboardUpdate', (data) => {
      setLeaderboard(data.slice(0, 10)); // Top 10
    });

    socket.on('hypeEvent', (data) => {
      setHypeEvent(data);
      setTimeout(() => setHypeEvent(null), 5000);
    });

    return () => {
      socket.off('leaderboardUpdate');
      socket.off('hypeEvent');
    };
  }, [venueId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1419] via-[#1a1f2b] to-[#29374b] p-8 overflow-hidden">
      {/* Hype Event Overlay */}
      <AnimatePresence>
        {hypeEvent && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <div className="text-center">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              >
                <Zap className="w-32 h-32 text-[#c92946] mx-auto mb-6" />
              </motion.div>
              <h2 className="text-6xl font-extrabold text-[#d9deeb] text-glow">
                {hypeEvent.message}
              </h2>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-8xl font-extrabold text-[#d9deeb] mb-4 tracking-tighter">
          JAFFA
        </h1>
        <div className="flex items-center justify-center gap-4">
          <Trophy className="w-12 h-12 text-[#c92946]" />
          <p className="text-4xl font-bold text-[#c92946] uppercase">
            Live Leaderboard
          </p>
          <Trophy className="w-12 h-12 text-[#c92946]" />
        </div>
      </div>

      {/* Leaderboard */}
      <div className="max-w-6xl mx-auto space-y-4">
        {leaderboard.map((entry, index) => (
          <motion.div
            key={entry.userId}
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`glass-panel rounded-2xl p-6 flex items-center gap-6 ${
              index < 3 ? 'border-4 border-[#c92946]' : ''
            }`}
          >
            {/* Rank */}
            <div
              className={`flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center text-4xl font-extrabold ${
                index === 0
                  ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white'
                  : index === 1
                  ? 'bg-gradient-to-br from-gray-300 to-gray-500 text-white'
                  : index === 2
                  ? 'bg-gradient-to-br from-orange-400 to-orange-600 text-white'
                  : 'bg-[#29374b] text-[#d9deeb]'
              }`}
            >
              {index + 1}
            </div>

            {/* Name */}
            <div className="flex-1">
              <h3 className="text-4xl font-extrabold text-[#d9deeb]">
                {entry.displayName}
              </h3>
              {entry.currentStreak > 0 && (
                <p className="text-xl text-[#d9deeb]/60 flex items-center gap-2 mt-2">
                  <Zap className="w-6 h-6 text-[#c92946]" />
                  {entry.currentStreak} Streak
                </p>
              )}
            </div>

            {/* Points */}
            <div className="text-right">
              <p className="text-6xl font-extrabold text-[#c92946]">
                {entry.points || entry.totalPoints}
              </p>
              <p className="text-xl text-[#d9deeb]/60 uppercase">Points</p>
            </div>
          </motion.div>
        ))}
      </div>

      {leaderboard.length === 0 && (
        <div className="text-center text-[#d9deeb]/60 text-2xl mt-20">
          Waiting for players to join...
        </div>
      )}

      {/* Footer */}
      <div className="fixed bottom-8 left-0 right-0 text-center">
        <p className="text-xl text-[#d9deeb]/60">
          Scan the QR code to join the game!
        </p>
      </div>
    </div>
  );
}
