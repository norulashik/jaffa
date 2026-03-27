import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useGame } from '../../context/GameContext';
import { toast } from 'sonner';

export default function CafeLandingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { state, dispatch } = useGame();
  const [venue, setVenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    loadVenue();
  }, [slug]);

  const loadVenue = async () => {
    try {
      const data = await api.getVenueBySlug(slug!);
      setVenue(data);
      dispatch({ type: 'SET_VENUE', payload: { venueId: data.id, venueSlug: slug } });

      // If user is already logged in, redirect to lobby
      if (state.token) {
        navigate(`/cafe/${slug}/lobby`);
      } else {
        navigate(`/login`);
      }
    } catch (error: any) {
      toast.error('Venue not found');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1419] flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#c92946] animate-spin" />
      </div>
    );
  }

  return null;
}
