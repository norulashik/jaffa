import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { GiTrophyCup, GiUpgrade, GiLightningTrio } from 'react-icons/gi';
import { api } from '../lib/api';
import { useGame } from '../context/GameContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Avatar, AvatarFallback } from './ui/avatar';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarConfig?: string;
  points: number;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  accuracy?: number;
}

interface LeaderboardProps {
  matchId: string;
  venueId: string;
}

const rankColors = ['#ffd60a', '#9ca3af', '#ff6341'] as const;
const rankBg = ['#1a1400', '#1a1a1a', '#1a0e08'] as const;

export default function Leaderboard({ matchId, venueId }: LeaderboardProps) {
  const { state } = useGame();
  const [matchLeaderboard, setMatchLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [roundLeaderboard, setRoundLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedRound, setSelectedRound] = useState(state.currentRound || 1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboards();
    const interval = setInterval(loadLeaderboards, 10000);
    return () => clearInterval(interval);
  }, [matchId, venueId, selectedRound]);

  const loadLeaderboards = async () => {
    try {
      const [matchData, roundData] = await Promise.all([
        api.getLeaderboardMatch(matchId, venueId),
        api.getLeaderboardRound(matchId, venueId, selectedRound),
      ]);
      setMatchLeaderboard(matchData);
      setRoundLeaderboard(roundData);
    } catch (error) {
      console.error('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const renderEntry = (entry: LeaderboardEntry, index: number) => {
    const isCurrentUser = entry.userId === state.userId;
    const isTop3 = index < 3;
    const accentColor = isTop3 ? rankColors[index] : '#555';

    return (
      <motion.div
        key={entry.userId}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        className="flex items-center gap-4 p-4"
        style={{
          background: isCurrentUser ? '#1a0e08' : (isTop3 ? rankBg[index] : '#1a1a1a'),
          border: isCurrentUser ? `2px solid #ff6341` : `2px solid ${isTop3 ? accentColor : '#333'}`,
          borderRadius: '4px',
          boxShadow: `4px 4px 0 0 ${isTop3 ? accentColor : (isCurrentUser ? '#ff6341' : '#222')}`,
        }}
      >
        {/* Rank */}
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
          {isTop3 ? (
            <div
              className="w-10 h-10 flex items-center justify-center font-black text-base"
              style={{
                background: accentColor,
                color: '#000',
                border: '2px solid #000',
                borderRadius: '2px',
                fontFamily: 'Bungee',
                boxShadow: '2px 2px 0 0 #000',
              }}
            >
              {index + 1}
            </div>
          ) : (
            <span
              className="text-lg font-black"
              style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Bungee' }}
            >
              {index + 1}
            </span>
          )}
        </div>

        {/* Avatar */}
        <Avatar
          className="w-9 h-9 flex-shrink-0"
          style={{ border: `2px solid ${accentColor}`, borderRadius: '2px' }}
        >
          <AvatarFallback
            className="text-black text-xs font-black"
            style={{ background: accentColor, borderRadius: '0' }}
          >
            {entry.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Name + streak */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-white truncate uppercase text-sm">
            {entry.displayName}
            {isCurrentUser && (
              <span
                className="ml-2 text-xs px-1 py-0.5"
                style={{ background: '#ff6341', color: '#000', borderRadius: '2px', fontFamily: 'Bungee' }}
              >
                YOU
              </span>
            )}
          </p>
          <div className="flex items-center gap-3 text-xs text-white/50 font-bold mt-0.5">
            {entry.currentStreak > 0 && (
              <span className="flex items-center gap-1">
                <GiLightningTrio className="w-3 h-3 text-[#ffd60a]" fill="currentColor" />
                {entry.currentStreak}
              </span>
            )}
            {entry.accuracy !== undefined && (
              <span>{Math.round(entry.accuracy)}% acc</span>
            )}
          </div>
        </div>

        {/* Points */}
        <div className="text-right flex-shrink-0">
          <p
            className="text-xl font-black"
            style={{ fontFamily: 'Bungee', color: accentColor }}
          >
            {entry.points || entry.totalPoints}
          </p>
          <p className="text-xs text-white/40 uppercase font-black">pts</p>
        </div>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div
        className="p-8 text-center"
        style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
      >
        <p className="text-white/50 font-bold">Loading leaderboard...</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="match" className="w-full">
      <TabsList
        className="grid w-full grid-cols-2 mb-6 h-12 p-0"
        style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px' }}
      >
        <TabsTrigger
          value="match"
          className="font-black uppercase data-[state=active]:text-black data-[state=active]:bg-[#ff6341]"
          style={{ borderRadius: '2px' }}
        >
          <GiTrophyCup className="w-4 h-4 mr-2" fill="currentColor" />
          MATCH
        </TabsTrigger>
        <TabsTrigger
          value="round"
          className="font-black uppercase data-[state=active]:text-black data-[state=active]:bg-[#ff6341]"
          style={{ borderRadius: '2px' }}
        >
          <GiUpgrade className="w-4 h-4 mr-2" fill="currentColor" />
          ROUND {selectedRound}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="match" className="space-y-3">
        {matchLeaderboard.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px' }}
          >
            <p className="text-white/50 font-bold">No players yet</p>
          </div>
        ) : (
          matchLeaderboard.map((entry, index) => renderEntry(entry, index))
        )}
      </TabsContent>

      <TabsContent value="round" className="space-y-3">
        {roundLeaderboard.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ background: '#1a1a1a', border: '2px solid #333', borderRadius: '4px' }}
          >
            <p className="text-white/50 font-bold">No predictions for this round yet</p>
          </div>
        ) : (
          roundLeaderboard.map((entry, index) => renderEntry(entry, index))
        )}
      </TabsContent>
    </Tabs>
  );
}
