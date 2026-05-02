"use client";

import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

interface RoomCardProps {
  room: {
    id: string;
    name: string;
    code: string;
    status: string;
    isSeasonRoom?: boolean;
    memberCount: number;
    maxPlayers: number;
    match?: {
      id: string;
      team1: string;
      team2: string;
      team1Short?: string;
      team2Short?: string;
      status: string;
    };
    host?: {
      displayName: string;
    };
  };
}

export default function RoomCard({ room }: RoomCardProps) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/room/${room.id}`)}
      className="game-card cursor-pointer transition-all hover:border-[#ff6341] mb-3"
      style={{ border: "2px solid #333" }}
    >
      <div className="flex items-center justify-between mb-2">
        <h4
          className="font-bold text-sm text-white uppercase truncate"
          style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
        >
          {room.name}
        </h4>
        <span className={room.status === "active" ? "live-badge" : "info-pill"}>
          {room.status === "active" ? "LIVE" : room.status.toUpperCase()}
        </span>
      </div>

      {!room.isSeasonRoom && room.match && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
            {(room.match.team1Short || room.match.team1?.slice(0, 3))?.toUpperCase()}
          </span>
          <span className="text-[10px]" style={{ color: "#ff6341" }}>vs</span>
          <span className="text-xs font-bold" style={{ fontFamily: "'Bungee', 'Impact', cursive" }}>
            {(room.match.team2Short || room.match.team2?.slice(0, 3))?.toUpperCase()}
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 text-[10px] text-[#6b7280]">
        <Users size={12} />
        <span>{room.memberCount}/{room.maxPlayers} players</span>
        {room.host && <span className="ml-2">Host: {room.host.displayName}</span>}
      </div>
    </div>
  );
}
