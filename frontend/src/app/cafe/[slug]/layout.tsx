"use client";

import { useEffect, useState, ReactNode } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

const BUNGEE: React.CSSProperties = {
  fontFamily: "'Bungee', 'Impact', cursive",
  textTransform: "uppercase" as const,
};

export default function CafeLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");

  useEffect(() => {
    if (!slug) return;

    // Check if we already validated this slug
    const cachedSlug = localStorage.getItem("jaffa_venue_slug");
    if (cachedSlug === slug) {
      setStatus("valid");
      return;
    }

    // Validate via API
    api.getVenueBySlug(slug)
      .then((data) => {
        localStorage.setItem("jaffa_venue_id", data.id);
        localStorage.setItem("jaffa_venue_name", data.name);
        localStorage.setItem("jaffa_venue_slug", data.slug);
        setStatus("valid");
      })
      .catch(() => {
        setStatus("invalid");
      });
  }, [slug]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div
          className="w-10 h-10 animate-spin"
          style={{
            border: "3px solid #1a1a1a",
            borderTop: "3px solid #ff6341",
            borderRadius: "2px",
          }}
        />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6">
        <div className="game-card p-8 text-center max-w-sm w-full">
          <div
            className="w-16 h-16 mx-auto mb-4 bg-[#ff6341] flex items-center justify-center"
            style={{
              border: "3px solid #000",
              borderRadius: "3px",
              boxShadow: "4px 4px 0 0 #000",
            }}
          >
            <span className="text-3xl text-black" style={BUNGEE}>!</span>
          </div>
          <h1 className="text-xl mb-2" style={BUNGEE}>
            Venue Not Found
          </h1>
          <p className="text-white/50 text-sm">
            This cafe link is invalid or no longer active.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
