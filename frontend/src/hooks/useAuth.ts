"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";

export function useAuth(redirectTo = "/login") {
  const { state, dispatch } = useGame();
  const router = useRouter();

  useEffect(() => {
    const token = state.token || (typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null);

    if (!token) {
      router.push(redirectTo);
      return;
    }

    if (!state.user) {
      api.getMe()
        .then((user: any) => {
          dispatch({ type: "SET_USER", user, token });
        })
        .catch(() => {
          if (typeof window !== "undefined") localStorage.removeItem("jaffa_token");
          router.push(redirectTo);
        });
    }
  }, [state.token, state.user, router, redirectTo, dispatch]);

  return {
    user: state.user,
    token: state.token,
    isAuthenticated: !!state.token,
  };
}
