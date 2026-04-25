"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Trophy, Medal, Award } from "lucide-react";
import { api } from "@/lib/api";

const BUNGEE: React.CSSProperties = {
  fontFamily: "'Bungee', 'Impact', cursive",
  textTransform: "uppercase" as const,
};

interface VenueInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  rewardConfig: any;
}

export default function CafePage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [venue, setVenue] = useState<VenueInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    loadVenue();
  }, [slug]);

  const loadVenue = async () => {
    try {
      const data = await api.getVenueBySlug(slug);
      setVenue(data);
      // Store venue info for later use
      localStorage.setItem("jaffa_venue_id", data.id);
      localStorage.setItem("jaffa_venue_name", data.name);
      localStorage.setItem("jaffa_venue_slug", data.slug);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleEnter = () => {
    localStorage.removeItem("jaffa_token");
    localStorage.removeItem("jaffa_user");
    router.push(`/cafe/${slug}/login`);
  };

  if (loading) {
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

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6">
        <div
          className="game-card p-8 text-center max-w-sm w-full"
        >
          <div
            className="w-16 h-16 mx-auto mb-4 bg-[#ff6341] flex items-center justify-center"
            style={{
              border: "3px solid #000",
              borderRadius: "3px",
              boxShadow: "4px 4px 0 0 #000",
            }}
          >
            <span className="text-3xl text-black" style={BUNGEE}>?</span>
          </div>
          <h1 className="text-xl mb-2" style={BUNGEE}>Link Not Found</h1>
          <p className="text-white/50 text-sm">
            This invite link is invalid or no longer active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6">
      {/* Orange accent stripe at top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#ff6341] z-50" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm text-center space-y-8"
      >
        {/* Logo / Branding */}
        <div className="space-y-4">
          {venue?.logoUrl ? (
            <img
              src={venue.logoUrl}
              alt={venue.name}
              className="w-24 h-24 mx-auto object-cover"
              style={{
                border: "3px solid #ff6341",
                borderRadius: "4px",
                boxShadow: "5px 5px 0 0 #ff6341",
              }}
            />
          ) : (
            <div
              className="w-24 h-24 mx-auto bg-[#ff6341] flex items-center justify-center"
              style={{
                border: "3px solid #000",
                borderRadius: "4px",
                boxShadow: "5px 5px 0 0 #000",
              }}
            >
              <span className="text-4xl text-black" style={BUNGEE}>
                {venue?.name?.charAt(0)?.toUpperCase() || "J"}
              </span>
            </div>
          )}

          <div>
            <h1 className="text-2xl" style={BUNGEE}>
              {venue?.name}
            </h1>
            <p className="text-white/40 text-xs uppercase tracking-widest mt-1 font-bold">
              Powered by JAFFA
            </p>
          </div>
        </div>

        {/* Rewards Preview */}
        {venue?.rewardConfig && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="game-card p-5 text-left"
            style={{
              borderColor: "#ff6341",
            }}
          >
            <h3
              className="text-[#ff6341] text-xs tracking-wider mb-4"
              style={BUNGEE}
            >
              Prizes Up For Grabs
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Trophy size={18} className="text-[#ffd60a]" />
                <span className="text-white text-sm font-bold">
                  {venue.rewardConfig.grandPrize?.top1}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Medal size={18} className="text-white/50" />
                <span className="text-white/60 text-sm">
                  {venue.rewardConfig.grandPrize?.top2}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Award size={18} className="text-[#ff6341]/70" />
                <span className="text-white/60 text-sm">
                  {venue.rewardConfig.grandPrize?.top3}
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Enter Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.35 }}
        >
          <button
            onClick={handleEnter}
            className="btn-sticker btn-orange w-full py-4 text-lg"
            style={BUNGEE}
          >
            ENTER ARENA
          </button>
        </motion.div>

        <p className="text-white/30 text-xs uppercase tracking-wider">
          Predict. Compete. Win real rewards.
        </p>
      </motion.div>
    </div>
  );
}
