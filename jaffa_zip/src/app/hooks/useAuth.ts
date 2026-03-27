'use client';

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useGame } from '../context/GameContext';
import { api } from '../lib/api';

export function useAuth(redirectTo = '/login') {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    const token = state.token || localStorage.getItem('token');
    
    if (!token) {
      navigate(redirectTo);
      return;
    }

    if (!state.user) {
      api.getMe(token)
        .then((user) => {
          dispatch({ type: 'SET_USER', payload: user });
        })
        .catch(() => {
          localStorage.removeItem('token');
          navigate(redirectTo);
        });
    }
  }, [state.token, state.user, navigate, redirectTo, dispatch]);

  return { 
    user: state.user, 
    token: state.token, 
    isAuthenticated: !!state.token 
  };
}
