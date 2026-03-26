"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

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
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-primary-container border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🏏</div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">Venue Not Found</h1>
          <p className="text-on-surface-variant text-sm">This cafe link is invalid or no longer active.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* Logo / Branding */}
        <div className="space-y-4">
          {venue?.logoUrl ? (
            <img
              src={venue.logoUrl}
              alt={venue.name}
              className="w-24 h-24 rounded-2xl mx-auto object-cover border-2 border-primary-container/30"
            />
          ) : (
            <div className="w-24 h-24 rounded-2xl mx-auto bg-gradient-to-br from-primary-container to-primary-fixed-dim flex items-center justify-center">
              <span className="text-4xl font-black text-on-surface">
                {venue?.name?.charAt(0)?.toUpperCase() || "J"}
              </span>
            </div>
          )}

          <div>
            <h1 className="text-3xl font-black text-on-surface">{venue?.name}</h1>
            <p className="text-on-surface-variant text-sm mt-1">Powered by JAFFA</p>
          </div>
        </div>

        {/* Rewards Preview */}
        {venue?.rewardConfig && (
          <div className="bg-surface-container-low rounded-2xl p-5 border border-white/5 text-left">
            <h3 className="text-primary-container font-bold text-sm uppercase tracking-wider mb-3">
              Prizes Up For Grabs
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">🥇</span>
                <span className="text-on-surface text-sm">{venue.rewardConfig.grandPrize?.top1}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-on-surface-variant">🥈</span>
                <span className="text-on-surface-variant text-sm">{venue.rewardConfig.grandPrize?.top2}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-600">🥉</span>
                <span className="text-on-surface-variant text-sm">{venue.rewardConfig.grandPrize?.top3}</span>
              </div>
            </div>
          </div>
        )}

        {/* Enter Button */}
        <button
          onClick={handleEnter}
          className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold text-lg py-4 rounded-2xl transition-all shadow-[0_4px_20px_rgba(0,255,171,0.4)] active:scale-95"
        >
          Enter Arena
        </button>

        <p className="text-outline-variant text-xs">
          Predict. Compete. Win real rewards.
        </p>
      </div>
    </div>
  );
}
