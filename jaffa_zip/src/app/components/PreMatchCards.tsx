import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { GiReturnArrow, GiArrowCursor, GiCheckMark } from 'react-icons/gi';
import { api } from '../lib/api';
import { useGame } from '../context/GameContext';
import { toast } from 'sonner';

interface Prediction {
  id: string;
  question: string;
  options: { key: string; label: string; points: number }[];
  category: string;
  userAnswer?: string;
}

interface PreMatchCardsProps {
  matchId: string;
  venueId: string | null;
}

const optionAccents = ['#ff6341', '#ffd60a', '#3b9eff', '#22c55e'];

export default function PreMatchCards({ matchId, venueId }: PreMatchCardsProps) {
  const { dispatch } = useGame();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPreMatchPredictions();
  }, [matchId]);

  const loadPreMatchPredictions = async () => {
    try {
      const data = await api.getPredictions(matchId, venueId || undefined, undefined, undefined);
      const preMatch = data.filter((p: Prediction) => p.category === 'pre_match');
      setPredictions(preMatch);
    } catch (error) {
      toast.error('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  const currentPrediction = predictions[currentIndex];
  const hasAnswered = currentPrediction?.userAnswer;

  const handleNext = () => {
    if (currentIndex < predictions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedOption(null);
    }
  };

  const handleSubmit = async () => {
    if (!selectedOption || !currentPrediction) return;
    setSubmitting(true);
    try {
      const result = await api.submitAnswer(currentPrediction.id, selectedOption, undefined, venueId || undefined);
      dispatch({ type: 'UPDATE_PARTICIPANT', payload: result.participant });
      setPredictions((prev) =>
        prev.map((p) => (p.id === currentPrediction.id ? { ...p, userAnswer: selectedOption } : p))
      );
      toast.success('Prediction saved!');
      setTimeout(() => {
        if (currentIndex < predictions.length - 1) handleNext();
      }, 1000);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit prediction');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="p-8 text-center"
        style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
      >
        <p className="text-white/50 font-bold">Loading pre-match predictions...</p>
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div
        className="p-8 text-center"
        style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '4px', boxShadow: '4px 4px 0 0 #333' }}
      >
        <p className="text-white/50 font-bold">No pre-match predictions available. Match will start soon!</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span
            className="text-xs font-black uppercase px-3 py-1"
            style={{ background: '#1a1a1a', border: '2px solid #ff6341', borderRadius: '2px', color: '#ff6341' }}
          >
            PRE-MATCH PREDICTIONS
          </span>
          <span
            className="text-xs font-black px-3 py-1"
            style={{ background: '#ff6341', color: '#000', border: '2px solid #000', borderRadius: '2px', boxShadow: '2px 2px 0 0 #000' }}
          >
            {currentIndex + 1} / {predictions.length}
          </span>
        </div>
        {/* Progress bar */}
        <div
          className="h-3 mt-2"
          style={{ background: '#1a1a1a', border: '2px solid #2a2a2a', borderRadius: '2px' }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + 1) / predictions.length) * 100}%` }}
            className="h-full"
            style={{ background: '#ff6341', borderRadius: '1px', transition: 'width 0.3s steps(10, end)' }}
          />
        </div>
      </div>

      {/* Prediction Card */}
      {currentPrediction && (
        <motion.div
          key={currentPrediction.id}
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -80 }}
          className="p-7 relative"
          style={{
            background: '#1a1a1a',
            border: '3px solid #ff6341',
            borderRadius: '4px',
            boxShadow: '7px 7px 0 0 #ff6341',
          }}
        >
          {/* Answered check mark */}
          {hasAnswered && (
            <div className="absolute top-5 right-5">
              <div
                className="w-10 h-10 flex items-center justify-center"
                style={{ background: '#22c55e', border: '2px solid #000', borderRadius: '2px', boxShadow: '3px 3px 0 0 #000' }}
              >
                <GiCheckMark className="w-6 h-6 text-black" fill="currentColor" />
              </div>
            </div>
          )}

          {/* Question */}
          <h2 className="text-2xl md:text-3xl font-black text-white mb-6 uppercase" style={{ fontFamily: 'Bungee' }}>
            {currentPrediction.question}
          </h2>

          {/* Options */}
          <div className="space-y-3 mb-6">
            {currentPrediction.options.map((option, i) => {
              const accent = optionAccents[i % optionAccents.length];
              const isAnswered = hasAnswered && currentPrediction.userAnswer === option.key;
              const isSelected = selectedOption === option.key;
              const active = isAnswered || isSelected;
              return (
                <button
                  key={option.key}
                  onClick={() => !hasAnswered && setSelectedOption(option.key)}
                  disabled={!!hasAnswered}
                  className="w-full p-4 text-left transition-all disabled:cursor-not-allowed"
                  style={{
                    background: active ? accent : '#111',
                    border: active ? '2px solid #000' : '2px solid #2a2a2a',
                    borderRadius: '3px',
                    color: active ? '#000' : '#fff',
                    boxShadow: active ? '4px 4px 0 0 #000' : '3px 3px 0 0 #2a2a2a',
                    transform: active ? 'translate(-1px, -1px)' : '',
                    fontWeight: 800,
                    opacity: hasAnswered && !isAnswered ? 0.5 : 1,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black uppercase text-base">{option.label}</span>
                    <span
                      className="text-sm font-black px-2 py-0.5"
                      style={{
                        background: active ? 'rgba(0,0,0,0.2)' : '#1a1a1a',
                        border: `1px solid ${active ? '#000' : '#444'}`,
                        borderRadius: '2px',
                        color: active ? '#000' : accent,
                      }}
                    >
                      +{option.points} pts
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Nav buttons */}
          <div className="flex gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="flex-1 h-14 flex items-center justify-center gap-2 font-black uppercase disabled:opacity-40"
              style={{
                background: '#111',
                border: '2px solid #2a2a2a',
                borderRadius: '3px',
                color: '#9ca3af',
                boxShadow: '3px 3px 0 0 #2a2a2a',
                cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <GiReturnArrow className="w-5 h-5" fill="currentColor" />
              PREV
            </button>

            {!hasAnswered ? (
              <button
                onClick={handleSubmit}
                disabled={!selectedOption || submitting}
                className="flex-1 btn-sticker btn-orange h-14"
              >
                {submitting ? 'SAVING...' : 'SUBMIT'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentIndex === predictions.length - 1}
                className="flex-1 btn-sticker btn-green h-14 disabled:opacity-40"
              >
                NEXT
                <GiArrowCursor className="w-5 h-5 ml-2" fill="currentColor" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
