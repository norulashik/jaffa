import { useAuth } from '../hooks/useAuth';
import { useGame } from '../context/GameContext';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import Leaderboard from '../components/Leaderboard';
import { motion } from 'motion/react';

export default function LeaderboardPage() {
  useAuth();
  const { state } = useGame();

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
              LEADER<span className="text-[#ff6341]">BOARD</span>
            </h1>
            <div
              className="h-1 w-24 mt-2"
              style={{ background: '#ff6341', boxShadow: '2px 2px 0 0 #000' }}
            />
            <p className="text-white/50 font-bold mt-3">See how you rank against other players</p>
          </div>

          {state.matchId && state.venueId ? (
            <Leaderboard matchId={state.matchId} venueId={state.venueId} />
          ) : (
            <div
              className="p-12 text-center"
              style={{
                background: '#1a1a1a',
                border: '2px solid #2a2a2a',
                borderRadius: '4px',
                boxShadow: '4px 4px 0 0 #ff6341',
              }}
            >
              <p className="text-white/50 mb-6 font-bold">Join a match to see the leaderboard</p>
              <button
                onClick={() => (window.location.href = '/lobby')}
                className="btn-sticker btn-orange px-8 py-4"
              >
                GO TO LOBBY
              </button>
            </div>
          )}
        </motion.div>
      </main>

      <BottomNav />
    </div>
  );
}