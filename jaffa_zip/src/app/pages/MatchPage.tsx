import { useParams, useSearchParams, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { GiHourglass } from 'react-icons/gi';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { useGame } from '../context/GameContext';
import { getSocket } from '../lib/socket';
import Header from '../components/Header';
import BottomNav from '../components/BottomNav';
import LiveGame from '../components/LiveGame';
import PreMatchCards from '../components/PreMatchCards';

interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Short: string;
  team2Short: string;
  status: 'upcoming' | 'live' | 'completed';
  currentPhase: string;
  currentOver?: number;
  currentInnings?: number;
  scoreData?: any;
}

export default function MatchPage() {
  useAuth();
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, dispatch } = useGame();
  
  const [match, setMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(true);
  const [venueId, setVenueId] = useState<string | null>(null);
  
  const socket = getSocket(venueId, matchId || null);

  useEffect(() => {
    if (!matchId) {
      navigate('/lobby');
      return;
    }

    const code = searchParams.get('code');
    const venue = searchParams.get('venueId');
    
    if (venue) {
      setVenueId(venue);
      dispatch({ type: 'SET_VENUE', payload: { venueId: venue } });
    }

    if (code && venue) {
      joinMatch(matchId, venue, code);
    } else {
      loadMatchState();
    }
  }, [matchId]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('newPrediction', handleNewPrediction);
    socket.on('predictionResolved', handlePredictionResolved);
    socket.on('leaderboardUpdate', handleLeaderboardUpdate);
    socket.on('scoreUpdate', handleScoreUpdate);
    socket.on('matchStarted', handleMatchStarted);
    socket.on('matchEnd', handleMatchEnd);
    socket.on('hypeEvent', handleHypeEvent);
    socket.on('roundWinner', handleRoundWinner);

    return () => {
      socket.off('newPrediction');
      socket.off('predictionResolved');
      socket.off('leaderboardUpdate');
      socket.off('scoreUpdate');
      socket.off('matchStarted');
      socket.off('matchEnd');
      socket.off('hypeEvent');
      socket.off('roundWinner');
    };
  }, [socket]);

  const joinMatch = async (matchId: string, venueId: string, code: string) => {
    try {
      const participant = await api.joinMatch(matchId, venueId, code);
      dispatch({ type: 'UPDATE_PARTICIPANT', payload: participant });
      dispatch({ type: 'SET_MATCH', payload: matchId });
      toast.success('Joined match successfully!');
      await loadMatchState();
    } catch (error: any) {
      toast.error(error.message || 'Failed to join match');
      navigate('/lobby');
    }
  };

  const loadMatchState = async () => {
    if (!matchId) return;
    
    try {
      const data = await api.getMatchState(matchId, venueId || undefined);
      setMatch(data.match);
      
      if (data.participant) {
        dispatch({ type: 'UPDATE_PARTICIPANT', payload: data.participant });
      }
    } catch (error: any) {
      toast.error('Failed to load match');
      navigate('/lobby');
    } finally {
      setLoading(false);
    }
  };

  // Socket event handlers
  const handleNewPrediction = (data: any) => {
    toast.info('New prediction available!', { duration: 2000 });
    loadMatchState();
  };

  const handlePredictionResolved = (data: any) => {
    // Will be handled by LiveGame component
  };

  const handleLeaderboardUpdate = (data: any) => {
    // Will be handled by LiveGame component
  };

  const handleScoreUpdate = (data: any) => {
    setMatch((prev) => prev ? { ...prev, scoreData: data } : null);
  };

  const handleMatchStarted = (data: any) => {
    toast.success('Match has started!', { duration: 3000 });
    loadMatchState();
  };

  const handleMatchEnd = (data: any) => {
    toast.success('Match completed!', { duration: 3000 });
    loadMatchState();
  };

  const handleHypeEvent = (data: any) => {
    toast(data.message, {
      duration: 5000,
      icon: '🔥',
    });
  };

  const handleRoundWinner = (data: any) => {
    if (data.userId === state.userId) {
      toast.success(`You won Round ${data.round}! 🎉`, { duration: 5000 });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d0d' }}>
        <div className="text-center">
          <GiHourglass className="w-12 h-12 text-[#ff6341] animate-spin mx-auto mb-4" fill="currentColor" />
          <p className="text-white/50 font-bold">Loading match...</p>
        </div>
      </div>
    );
  }

  if (!match) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d0d' }}>
      <Header />

      <main className="flex-1 pb-20">
        {/* Match Header */}
        <div
          className="p-5"
          style={{ background: '#1a1a1a', borderBottom: '3px solid #ff6341', boxShadow: '0 4px 0 0 #000' }}
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span
                className="px-3 py-1 text-xs font-black uppercase"
                style={
                  match.status === 'live'
                    ? { background: '#ff6341', color: '#000', border: '2px solid #000', borderRadius: '2px', boxShadow: '2px 2px 0 0 #000' }
                    : match.status === 'upcoming'
                    ? { background: '#222', color: '#fff', border: '2px solid #555', borderRadius: '2px' }
                    : { background: '#111', color: 'rgba(255,255,255,0.4)', border: '2px solid #333', borderRadius: '2px' }
                }
              >
                {match.status === 'live' && '● LIVE'}
                {match.status === 'upcoming' && 'UPCOMING'}
                {match.status === 'completed' && 'COMPLETED'}
              </span>
              {match.currentOver && (
                <span
                  className="text-sm font-black px-2 py-0.5"
                  style={{ background: '#222', border: '1px solid #555', borderRadius: '2px', color: '#fff' }}
                >
                  OVER {match.currentOver}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase">
                  {match.team1Short}
                </h2>
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
                <h2 className="text-2xl md:text-3xl font-black text-white uppercase">
                  {match.team2Short}
                </h2>
              </div>
            </div>

            {/* Player Stats */}
            {state.totalPoints > 0 && (
              <div className="mt-4 flex items-center justify-center gap-4">
                {[
                  { label: 'POINTS', value: state.totalPoints, color: '#ff6341' },
                  { label: 'STREAK', value: `${state.currentStreak} 🔥`, color: '#ffd60a' },
                  { label: 'ROUND', value: state.currentRound, color: '#fff' },
                ].map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="text-center px-4 py-2"
                    style={{ background: '#111', border: '2px solid #333', borderRadius: '4px', boxShadow: `3px 3px 0 0 ${color}` }}
                  >
                    <p className="text-white/50 uppercase text-xs font-black">{label}</p>
                    <p className="text-xl font-black" style={{ fontFamily: 'Bungee', color }}>{value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Game Content */}
        <div className="max-w-4xl mx-auto px-4 py-5">
          {match.status === 'upcoming' && (
            <PreMatchCards matchId={matchId!} venueId={venueId} />
          )}

          {match.status === 'live' && (
            <LiveGame matchId={matchId!} venueId={venueId} match={match} />
          )}

          {match.status === 'completed' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-12 text-center"
              style={{
                background: '#1a1a1a',
                border: '2px solid #ff6341',
                borderRadius: '4px',
                boxShadow: '6px 6px 0 0 #ff6341',
              }}
            >
              <h2 className="text-3xl font-black text-white mb-4">MATCH COMPLETED</h2>
              <p className="text-white/50 mb-6 font-bold">
                Check the leaderboard to see final standings
              </p>
              <button
                onClick={() => navigate('/leaderboard')}
                className="btn-game px-8 py-4"
              >
                VIEW LEADERBOARD
              </button>
            </motion.div>
          )}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}