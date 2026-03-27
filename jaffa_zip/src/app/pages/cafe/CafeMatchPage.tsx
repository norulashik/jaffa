// Venue-scoped match page - redirects to main match page with venue context
import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';

export default function CafeMatchPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Preserve query params (code, venueId)
    const queryString = searchParams.toString();
    navigate(`/match/${matchId}${queryString ? `?${queryString}` : ''}`);
  }, [matchId]);

  return null;
}
