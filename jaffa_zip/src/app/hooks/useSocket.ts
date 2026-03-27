'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

export function useSocket(venueId: string | null, matchId: string | null) {
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (!venueId || !matchId) return;

    const socket = getSocket();
    socketRef.current = socket;

    socket.emit('joinVenueMatch', { venueId, matchId });

    return () => {
      socket.emit('leaveVenueMatch', { venueId, matchId });
    };
  }, [venueId, matchId]);

  return socketRef.current;
}
