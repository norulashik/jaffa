import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GiLightningTrio, GiUpgrade, GiInfo, GiCrystalBall } from 'react-icons/gi';
import { api } from '../lib/api';
import { useGame } from '../context/GameContext';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import Leaderboard from './Leaderboard';

interface Prediction {
  id: string;
  question: string;
  options: { key: string; label: string; points: number }[];
  category: string;
  overNumber?: number;
  status: 'open' | 'locked' | 'resolved';
  expiresAt?: string;
  userAnswer?: string;
  correctOption?: string;
}

interface LiveGameProps {
  matchId: string;
  venueId: string | null;
  match: any;
}

/* Cycle through 4 accent colors for option buttons */
const optionAccents = ['#ff6341', '#ffd60a', '#3b9eff', '#22c55e'];

export default function LiveGame({ matchId, venueId, match }: LiveGameProps) {
  const { state, dispatch } = useGame();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [boostType, setBoostType] = useState<'2x' | 'all_in' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPredictions();
    const interval = setInterval(loadPredictions, 10000);
    return () => clearInterval(interval);
  }, [matchId, state.currentRound]);

  const loadPredictions = async () => {
    try {
      const data = await api.getPredictions(matchId, venueId || undefined, state.currentRound || undefined, 'open');
      setPredictions(data);
    } catch (error) {
      console.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedPrediction || !selectedOption) return;
    setSubmitting(true);
    try {
      const result = await api.submitAnswer(selectedPrediction, selectedOption, boostType || undefined, venueId || undefined);
      dispatch({ type: 'UPDATE_PARTICIPANT', payload: result.participant });
      setPredictions((prev) =>
        prev.map((p) =>
          p.id === selectedPrediction ? { ...p, userAnswer: selectedOption, status: 'locked' } : p
        )
      );
      toast.success('Prediction submitted!');
      setSelectedPrediction(null);
      setSelectedOption(null);
      setBoostType(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit prediction');
    } finally {
      setSubmitting(false);
    }
  };

  const openPredictions = predictions.filter((p) => p.status === 'open' && !p.userAnswer);

  return (
    <div className="space-y-5">
      <Tabs defaultValue="predict" className="w-full">
        <TabsList
          className="grid w-full grid-cols-2 mb-5 h-12 p-0"
          style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px' }}
        >
          <TabsTrigger
            value="predict"
            className="font-black uppercase data-[state=active]:text-black data-[state=active]:bg-[#ff6341]"
            style={{ borderRadius: '2px' }}
          >
            <GiCrystalBall className="w-4 h-4 mr-2" fill="currentColor" />
            PREDICT
          </TabsTrigger>
          <TabsTrigger
            value="leaderboard"
            className="font-black uppercase data-[state=active]:text-black data-[state=active]:bg-[#ff6341]"
            style={{ borderRadius: '2px' }}
          >
            LEADERBOARD
          </TabsTrigger>
        </TabsList>

        <TabsContent value="predict" className="space-y-4">
          {loading && (
            <div
              className="p-8 text-center"
              style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
            >
              <p className="text-white/50 font-bold">Loading predictions...</p>
            </div>
          )}

          {!loading && openPredictions.length === 0 && (
            <div
              className="p-10 text-center"
              style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
            >
              <GiInfo className="w-12 h-12 mx-auto mb-4" style={{ color: '#9ca3af' }} fill="currentColor" />
              <p className="text-white/50 font-bold">No predictions right now. Wait for the next over!</p>
            </div>
          )}

          {openPredictions.map((prediction) => (
            <motion.div
              key={prediction.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6"
              style={{
                background: '#1a1a1a',
                border: '2px solid #2a2a2a',
                borderRadius: '4px',
                boxShadow: '4px 4px 0 0 #ff6341',
              }}
            >
              {/* Category chip */}
              {prediction.category !== 'per_over' && (
                <span
                  className="inline-block px-3 py-1 text-xs font-black uppercase mb-4"
                  style={{
                    background: '#ff6341',
                    color: '#000',
                    border: '2px solid #000',
                    borderRadius: '2px',
                    boxShadow: '2px 2px 0 0 #000',
                  }}
                >
                  {prediction.category.replace('_', ' ')}
                </span>
              )}

              {/* Question */}
              <h3 className="text-xl font-black text-white mb-5 uppercase" style={{ fontFamily: 'Bungee' }}>
                {prediction.question}
              </h3>

              {/* Options — each gets a different accent color on selection */}
              <div className="space-y-3 mb-5">
                {prediction.options.map((option, i) => {
                  const accent = optionAccents[i % optionAccents.length];
                  const isSelected = selectedPrediction === prediction.id && selectedOption === option.key;
                  return (
                    <button
                      key={option.key}
                      onClick={() => {
                        setSelectedPrediction(prediction.id);
                        setSelectedOption(option.key);
                      }}
                      className="w-full p-4 text-left transition-all"
                      style={{
                        background: isSelected ? accent : '#111',
                        border: isSelected ? '2px solid #000' : '2px solid #2a2a2a',
                        borderRadius: '3px',
                        color: isSelected ? '#000' : '#fff',
                        boxShadow: isSelected ? `4px 4px 0 0 #000` : `3px 3px 0 0 #2a2a2a`,
                        transform: isSelected ? 'translate(-1px, -1px)' : '',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black uppercase">{option.label}</span>
                        <span
                          className="text-sm font-black px-2 py-0.5"
                          style={{
                            background: isSelected ? 'rgba(0,0,0,0.2)' : '#1a1a1a',
                            border: `1px solid ${isSelected ? '#000' : '#444'}`,
                            borderRadius: '2px',
                            color: isSelected ? '#000' : accent,
                          }}
                        >
                          +{option.points} pts
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Boosts + Submit */}
              {selectedPrediction === prediction.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  <p className="text-xs font-black text-white/50 uppercase">Apply Boost (Optional)</p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* 2X Boost — blue */}
                    <button
                      onClick={() => setBoostType(boostType === '2x' ? null : '2x')}
                      disabled={state.boostsUsedRound >= 2}
                      className="p-3 flex items-center justify-center gap-2 font-black uppercase transition-all disabled:opacity-40"
                      style={{
                        background: boostType === '2x' ? '#3b9eff' : '#111',
                        border: boostType === '2x' ? '2px solid #000' : '2px solid #2a2a2a',
                        borderRadius: '3px',
                        color: boostType === '2x' ? '#000' : '#3b9eff',
                        boxShadow: boostType === '2x' ? '3px 3px 0 0 #000' : '3px 3px 0 0 #1a6fc4',
                      }}
                    >
                      <GiLightningTrio className="w-4 h-4" fill="currentColor" />
                      <span>2X BOOST</span>
                    </button>

                    {/* All In — yellow */}
                    <button
                      onClick={() => setBoostType(boostType === 'all_in' ? null : 'all_in')}
                      disabled={state.allInUsed}
                      className="p-3 flex items-center justify-center gap-2 font-black uppercase transition-all disabled:opacity-40"
                      style={{
                        background: boostType === 'all_in' ? '#ffd60a' : '#111',
                        border: boostType === 'all_in' ? '2px solid #000' : '2px solid #2a2a2a',
                        borderRadius: '3px',
                        color: boostType === 'all_in' ? '#000' : '#ffd60a',
                        boxShadow: boostType === 'all_in' ? '3px 3px 0 0 #000' : '3px 3px 0 0 #d4a800',
                      }}
                    >
                      <GiUpgrade className="w-4 h-4" fill="currentColor" />
                      <span>ALL IN</span>
                    </button>
                  </div>

                  {/* The BIG PREDICT button — sticker label style */}
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedOption || submitting}
                    className="w-full btn-sticker btn-green h-14 text-lg"
                    style={{ fontFamily: 'Bungee' }}
                  >
                    {submitting ? 'LOCKING IN...' : '🔒 LOCK IN PREDICTION'}
                  </button>
                </motion.div>
              )}
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-2">
          <Leaderboard matchId={matchId} venueId={venueId || ''} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
