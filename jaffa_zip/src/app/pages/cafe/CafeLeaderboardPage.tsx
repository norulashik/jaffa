import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function CafeLeaderboardPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/leaderboard');
  }, []);

  return null;
}
