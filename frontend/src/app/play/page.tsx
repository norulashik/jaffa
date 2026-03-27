"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function PlayRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const venueId = searchParams.get("v") || searchParams.get("venue");
    const matchId = searchParams.get("m") || searchParams.get("match");
    if (venueId) localStorage.setItem("jaffa_venue_id", venueId);
    if (matchId) localStorage.setItem("jaffa_match_id", matchId);

    const token = localStorage.getItem("jaffa_token");
    if (token && matchId) {
      router.replace(`/match/${matchId}`);
    } else if (token) {
      router.replace("/lobby");
    } else {
      router.replace("/login");
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-[#ff6341] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense>
      <PlayRedirect />
    </Suspense>
  );
}
