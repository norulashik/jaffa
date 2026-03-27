// This is a venue-scoped version of LobbyPage
// For simplicity, redirect to the main lobby
import { useEffect } from 'react';
import { useNavigate } from 'react-router';

export default function CafeLobbyPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/lobby');
  }, []);

  return null;
}
