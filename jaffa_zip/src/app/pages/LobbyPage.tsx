import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { GiTrophyCup, GiHourglass, GiAbstract050 } from 'react-icons/gi';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { toast } from 'sonner';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Short: string;
  team2Short: string;
  startTime: string;
  status: 'upcoming' | 'live' | 'completed';
  currentOver?: number;
  scoreData?: any;
}

export default function LobbyPage() {
  useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [matchCode, setMatchCode] = useState('');
  const [codeDialogOpen, setCodeDialogOpen] = useState(false);

  useEffect(() => {
    loadMatches();
    const interval = setInterval(loadMatches, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadMatches = async () => {
    try {
      const data = await api.getMatches();
      const sorted = data.sort((a: Match, b: Match) => {
        const order = { live: 1, upcoming: 2, completed: 3 };
        return order[a.status] - order[b.status];
      });
      setMatches(sorted);
    } catch (error: any) {
      toast.error('Failed to load matches');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (match: Match) => {
    setSelectedMatch(match);
    setCodeDialogOpen(true);
  };

  const handleJoinMatch = async () => {
    if (!matchCode || !selectedMatch) {
      toast.error('Please enter a match code');
      return;
    }
    try {
      const validation = await api.validateMatchCode(matchCode);
      navigate(`/match/${selectedMatch.id}?code=${matchCode}&venueId=${validation.venueId}`);
    } catch (error: any) {
      toast.error(error.message || 'Invalid match code');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === today.toDateString()) {
      return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    }
  };

  const getStatusStyle = (status: string) => {
    if (status === 'live')
      return { background: '#ff6341', color: '#000', border: '2px solid #000', borderRadius: '2px', boxShadow: '2px 2px 0 0 #000' };
    if (status === 'upcoming')
      return { background: '#222', color: '#fff', border: '2px solid #555', borderRadius: '2px' };
    return { background: '#111', color: 'rgba(255,255,255,0.4)', border: '2px solid #333', borderRadius: '2px' };
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
          {/* Title */}
          <div className="mb-8 mt-4">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-1">
              MATCH <span className="text-[#ff6341]">LOBBY</span>
            </h1>
            <div
              className="h-1 w-24 mt-2"
              style={{ background: '#ff6341', boxShadow: '2px 2px 0 0 #000' }}
            />
            <p className="text-white/50 font-bold mt-3">Join a live match and start predicting</p>
          </div>

          {/* Loading skeletons */}
          {loading && (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-6 animate-pulse"
                  style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
                >
                  <div className="h-5 bg-[#222] rounded w-3/4 mb-4" />
                  <div className="h-4 bg-[#222] rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && matches.length === 0 && (
            <div
              className="p-12 text-center"
              style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px', boxShadow: '4px 4px 0 0 #ff6341' }}
            >
              <GiTrophyCup className="w-16 h-16 text-[#ff6341] mx-auto mb-4" fill="currentColor" />
              <h3 className="text-xl font-black text-white mb-2 uppercase">NO MATCHES AVAILABLE</h3>
              <p className="text-white/50 font-bold">Check back soon for upcoming IPL matches</p>
            </div>
          )}

          {/* Match list */}
          {!loading && matches.length > 0 && (
            <div className="grid gap-4">
              {matches.map((match) => (
                <motion.div
                  key={match.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleMatchClick(match)}
                  className="p-6 cursor-pointer card-lift"
                  style={{
                    background: '#1a1a1a',
                    border: match.status === 'live' ? '2px solid #ff6341' : '2px solid #333',
                    borderRadius: '4px',
                    boxShadow: match.status === 'live' ? '4px 4px 0 0 #ff6341' : '4px 4px 0 0 #333',
                  }}
                >
                  {/* Status */}
                  <div className="flex items-center justify-between mb-4">
                    <span
                      className="px-3 py-1 text-xs font-black uppercase"
                      style={getStatusStyle(match.status)}
                    >
                      {match.status === 'live' && '● LIVE'}
                      {match.status === 'upcoming' && 'UPCOMING'}
                      {match.status === 'completed' && 'COMPLETED'}
                    </span>
                    {match.status === 'live' && match.currentOver && (
                      <span
                        className="text-sm font-black px-2 py-0.5"
                        style={{ background: '#222', border: '1px solid #555', borderRadius: '2px', color: '#fff' }}
                      >
                        OVER {match.currentOver}
                      </span>
                    )}
                  </div>

                  {/* Teams */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-black text-white uppercase">{match.team1Short}</h3>
                      <p className="text-sm text-white/50 font-bold">{match.team1}</p>
                    </div>
                    <div className="px-4">
                      <span
                        className="text-2xl font-black px-3 py-1"
                        style={{
                          fontFamily: 'Bungee',
                          color: '#ff6341',
                          background: '#111',
                          border: '2px solid #ff6341',
                          borderRadius: '2px',
                        }}
                      >
                        VS
                      </span>
                    </div>
                    <div className="flex-1 text-right">
                      <h3 className="text-2xl font-black text-white uppercase">{match.team2Short}</h3>
                      <p className="text-sm text-white/50 font-bold">{match.team2}</p>
                    </div>
                  </div>

                  {/* Time */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-white/50 font-bold">
                      <GiHourglass className="w-4 h-4" fill="currentColor" />
                      <span>{formatDate(match.startTime)}</span>
                    </div>
                    {match.status !== 'completed' && (
                      <span
                        className="text-xs font-black uppercase px-2 py-0.5"
                        style={{ color: '#ff6341', border: '1px solid #ff6341', borderRadius: '2px' }}
                      >
                        TAP TO JOIN →
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      <BottomNav />

      {/* Match Code Dialog */}
      <Dialog open={codeDialogOpen} onOpenChange={setCodeDialogOpen}>
        <DialogContent
          style={{
            background: '#1a1a1a',
            border: '3px solid #ff6341',
            borderRadius: '4px',
            boxShadow: '6px 6px 0 0 #ff6341',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-white uppercase">
              ENTER MATCH CODE
            </DialogTitle>
          </DialogHeader>
          {selectedMatch && (
            <div className="space-y-4">
              <div
                className="p-4"
                style={{ background: '#111', border: '2px solid #333', borderRadius: '4px' }}
              >
                <p className="text-xs text-white/50 mb-1 font-black uppercase">Match</p>
                <p className="text-lg font-black text-white uppercase">
                  {selectedMatch.team1Short} vs {selectedMatch.team2Short}
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-white mb-2 uppercase tracking-wide">
                  Match Code
                </label>
                <div className="relative">
                  <GiAbstract050
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#ff6341]"
                    fill="currentColor"
                  />
                  <Input
                    type="text"
                    value={matchCode}
                    onChange={(e) => setMatchCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="pl-12 h-14 text-lg uppercase font-black"
                    style={{
                      background: '#0d0d0d',
                      border: '2px solid #555',
                      borderRadius: '4px',
                      color: '#fff',
                      boxShadow: '3px 3px 0 0 #ff6341',
                    }}
                    maxLength={6}
                  />
                </div>
                <p className="text-xs text-white/40 mt-2 font-bold">
                  Get the code from your venue's TV screen or staff
                </p>
              </div>

              <button
                onClick={handleJoinMatch}
                disabled={!matchCode}
                className="w-full btn-sticker btn-orange h-14 text-lg"
              >
                JOIN MATCH
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}