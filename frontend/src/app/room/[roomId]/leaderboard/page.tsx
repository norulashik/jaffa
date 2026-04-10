"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import RoomLeaderboard from "@/components/RoomLeaderboard";

export default function RoomLeaderboardPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push("/login");
    }
  }, []);

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        <section className="mb-4">
          <h2
            className="text-2xl font-bold tracking-tight uppercase text-white"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            ROOM LEADERBOARD
          </h2>
        </section>

        <RoomLeaderboard roomId={roomId} />
      </main>

      <BottomNav />
    </div>
  );
}
