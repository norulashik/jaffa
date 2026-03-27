import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function CafeRewardsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/rewards');
  }, []);

  return null;
}
