"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import { api } from "@/lib/api";
import { useGame } from "@/context/GameContext";
import { isCafeRoute } from "@/lib/navigation";
import { toast } from "sonner";
import { GiCrownCoin } from "react-icons/gi";
import { Loader2, CheckCircle } from "lucide-react";

const BRAND_COLORS: Record<string, string> = {
  paytm: "#00B9F1",
  zomato: "#E23744",
  bookmyshow: "#C4242B",
  swiggy: "#FC8019",
  uber: "#276EF1",
  myntra: "#FF3E6C",
  amazon: "#FF9900",
  starbucks: "#00704A",
};

const BRAND_LOGOS: Record<string, string> = {
  paytm: "/brands/paytm.png",
  zomato: "/brands/zomato.png",
  bookmyshow: "/brands/bookmyshow.png",
  swiggy: "/brands/swiggy.png",
  uber: "/brands/uber.png",
  myntra: "/brands/myntra.png",
  amazon: "/brands/amazon.png",
  starbucks: "/brands/starbucks.png",
};

const BRAND_HEADLINES: Record<string, string> = {
  paytm: "₹20",
  zomato: "FREE",
  bookmyshow: "₹25",
  swiggy: "10%",
  uber: "₹30",
  myntra: "15%",
  amazon: "₹50",
  starbucks: "FREE",
};

const BRAND_SUBLINES: Record<string, string> = {
  paytm: "CASHBACK",
  zomato: "DELIVERY",
  bookmyshow: "OFF",
  swiggy: "OFF",
  uber: "OFF",
  myntra: "OFF",
  amazon: "VOUCHER",
  starbucks: "TALL DRINK",
};

interface RewardItem {
  key: string;
  name: string;
  brand: string;
  description: string;
  pointsCost: number;
  emoji: string;
  canRedeem: boolean;
  alreadyRedeemed: boolean;
}

interface Redemption {
  id: string;
  rewardKey: string;
  rewardName: string;
  pointsSpent: number;
  redeemedAt: string;
}

export default function RedeemPage() {
  const router = useRouter();
  const { state, dispatch } = useGame();
  const [catalog, setCatalog] = useState<RewardItem[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (!token) {
      router.push(isCafeRoute() ? "/cafe/login" : "/login");
      return;
    }
    loadCatalog();
  }, []);

  const loadCatalog = async () => {
    try {
      const data = await api.getWeeklyRewardsCatalog();
      setCatalog(data.catalog);
      setRedemptions(data.redemptions);
      setWeeklyPoints(data.weeklyPoints);
      dispatch({ type: "SET_WEEKLY_POINTS", weeklyPoints: data.weeklyPoints });
    } catch {
      toast.error("Failed to load rewards");
    } finally {
      setLoading(false);
    }
  };

  const handleRedeem = async (rewardKey: string) => {
    setRedeeming(rewardKey);
    try {
      const result = await api.redeemWeeklyReward(rewardKey);
      setWeeklyPoints(result.weeklyPoints);
      dispatch({ type: "SET_WEEKLY_POINTS", weeklyPoints: result.weeklyPoints });
      toast.success("Reward redeemed!");
      loadCatalog();
    } catch (err: any) {
      toast.error(err.message || "Failed to redeem");
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <div className="bg-[#0d0d0d] text-white min-h-screen pb-24">
      <Header />

      <main className="pt-24 px-4 space-y-6 max-w-2xl mx-auto">
        {/* Title */}
        <section className="mb-2">
          <h2
            className="text-2xl font-bold tracking-tight uppercase text-white"
            style={{ fontFamily: "'Bungee', 'Impact', cursive" }}
          >
            REDEEM REWARDS
          </h2>
          <p className="text-xs text-[#6b7280] mt-1">Spend your weekly points on real brand rewards</p>
        </section>

        {/* Weekly Points Banner */}
        <div
          className="game-card text-center"
          style={{ border: "2px solid #ff6341", boxShadow: "0 0 20px rgba(255,99,65,0.2)" }}
        >
          <p className="text-xs text-[#6b7280] uppercase tracking-wider font-bold mb-1">
            This Week&apos;s Points
          </p>
          <div className="flex items-center justify-center gap-3">
            <GiCrownCoin className="text-3xl text-[#ff6341]" />
            <span
              className="text-5xl font-black"
              style={{ fontFamily: "'Bungee', 'Impact', cursive", color: "#ff6341" }}
            >
              {weeklyPoints}
            </span>
          </div>
          <p className="text-[10px] text-[#6b7280] mt-2">Points reset every Monday</p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div
              className="w-8 h-8 animate-spin rounded-[2px]"
              style={{ border: "3px solid #ff6341", borderTopColor: "transparent" }}
            />
          </div>
        )}

        {/* Rewards Catalog */}
        {!loading && (
          <>
            <h3
              className="text-lg font-bold text-white pl-3 uppercase"
              style={{
                fontFamily: "'Bungee', 'Impact', cursive",
                borderLeft: "4px solid #ff6341",
              }}
            >
              AVAILABLE REWARDS
            </h3>

            <div className="space-y-4">
              {catalog.map((reward, index) => {
                const brandKey = reward.brand.toLowerCase().replace(/\s/g, "");
                const brandColor = reward.alreadyRedeemed
                  ? "#22c55e"
                  : !reward.canRedeem
                  ? "#555"
                  : BRAND_COLORS[brandKey] || "#ff6341";
                const headline = BRAND_HEADLINES[brandKey] || "";
                const subline = BRAND_SUBLINES[brandKey] || "";

                return (
                  <motion.div
                    key={reward.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex relative"
                    style={{
                      background: "#1a1a1a",
                      borderRadius: "6px",
                      border: `2px solid ${reward.alreadyRedeemed ? "#22c55e" : reward.canRedeem ? brandColor : "#333"}`,
                      boxShadow: `4px 4px 0 0 ${reward.alreadyRedeemed ? "#22c55e" : reward.canRedeem ? brandColor : "#333"}`,
                      overflow: "hidden",
                      opacity: !reward.canRedeem && !reward.alreadyRedeemed ? 0.55 : 1,
                    }}
                  >
                    {/* Semi-circular cutouts */}
                    <div
                      style={{
                        position: "absolute",
                        right: "62px",
                        top: "-7px",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: "#0d0d0d",
                        zIndex: 2,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        right: "62px",
                        bottom: "-7px",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: "#0d0d0d",
                        zIndex: 2,
                      }}
                    />

                    {/* Left brand color strip */}
                    <div
                      style={{
                        width: "6px",
                        minWidth: "6px",
                        background: brandColor,
                        flexShrink: 0,
                      }}
                    />

                    {/* Perforated edge */}
                    <div
                      style={{
                        width: "14px",
                        minWidth: "14px",
                        flexShrink: 0,
                        background: `radial-gradient(circle, #0d0d0d 3px, transparent 3px)`,
                        backgroundSize: "14px 18px",
                        backgroundPosition: "center",
                      }}
                    />

                    {/* Main content */}
                    <div
                      style={{
                        flex: 1,
                        padding: "14px 14px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        gap: "4px",
                      }}
                    >
                      {/* Brand row */}
                      <div className="flex items-center gap-3">
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            padding: "4px",
                          }}
                        >
                          <img
                            src={BRAND_LOGOS[brandKey] || ""}
                            alt={reward.brand}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontFamily: "'Bungee', 'Impact', cursive",
                            fontSize: "11px",
                            letterSpacing: "0.12em",
                            color: brandColor,
                            textTransform: "uppercase",
                          }}
                        >
                          {reward.brand}
                        </span>
                      </div>

                      {/* Headline row */}
                      <div className="flex items-baseline gap-2">
                        <span
                          style={{
                            fontFamily: "'Bungee', 'Impact', cursive",
                            fontSize: "24px",
                            color: "#ffffff",
                            lineHeight: 1.1,
                          }}
                        >
                          {headline}
                        </span>
                        <span
                          style={{
                            fontFamily: "'Bungee', 'Impact', cursive",
                            fontSize: "11px",
                            color: "#9ca3af",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                          }}
                        >
                          {subline}
                        </span>
                      </div>

                      {/* Description */}
                      <p style={{ fontSize: "11px", color: "#6b7280", margin: 0 }}>
                        {reward.description}
                      </p>

                      {/* Action row */}
                      <div className="mt-2">
                        {reward.alreadyRedeemed ? (
                          <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#22c55e]">
                            <CheckCircle size={14} /> Redeemed
                          </span>
                        ) : reward.canRedeem ? (
                          <button
                            onClick={() => handleRedeem(reward.key)}
                            disabled={redeeming === reward.key}
                            className="btn-sticker btn-orange px-5 py-1.5 text-xs font-bold uppercase disabled:opacity-50"
                          >
                            {redeeming === reward.key ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              "REDEEM"
                            )}
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-[#6b7280] tracking-wider">
                            NOT ENOUGH POINTS
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Points price tag */}
                    <div
                      style={{
                        width: "68px",
                        minWidth: "68px",
                        flexShrink: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#141414",
                        borderLeft: "2px dashed #2a2a2a",
                        padding: "10px 4px",
                        gap: "2px",
                      }}
                    >
                      <GiCrownCoin
                        style={{ fontSize: "18px", color: reward.canRedeem || reward.alreadyRedeemed ? brandColor : "#555" }}
                      />
                      <span
                        style={{
                          fontFamily: "'Bungee', 'Impact', cursive",
                          fontSize: "16px",
                          color: reward.canRedeem || reward.alreadyRedeemed ? brandColor : "#555",
                          lineHeight: 1,
                        }}
                      >
                        {reward.pointsCost}
                      </span>
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: 900,
                          color: "#6b7280",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                        }}
                      >
                        PTS
                      </span>
                    </div>

                    {/* Redeemed watermark stamp */}
                    {reward.alreadyRedeemed && (
                      <div
                        style={{
                          position: "absolute",
                          top: "50%",
                          left: "50%",
                          transform: "translate(-50%, -50%) rotate(-15deg)",
                          fontFamily: "'Bungee', 'Impact', cursive",
                          fontSize: "28px",
                          color: "#22c55e",
                          opacity: 0.15,
                          pointerEvents: "none",
                          whiteSpace: "nowrap",
                          letterSpacing: "0.15em",
                          textTransform: "uppercase",
                        }}
                      >
                        REDEEMED
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Redemptions History */}
            {redemptions.length > 0 && (
              <>
                <h3
                  className="text-lg font-bold text-white pl-3 uppercase mt-8"
                  style={{
                    fontFamily: "'Bungee', 'Impact', cursive",
                    borderLeft: "4px solid #22c55e",
                  }}
                >
                  YOUR REDEMPTIONS
                </h3>

                <div className="space-y-2">
                  {redemptions.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between px-4 py-3"
                      style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: "4px" }}
                    >
                      <div>
                        <p className="font-bold text-sm text-white">{r.rewardName}</p>
                        <p className="text-[10px] text-[#6b7280]">
                          {new Date(r.redeemedAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-[#ff6341]">
                        <GiCrownCoin className="text-sm" />
                        <span className="font-bold text-sm">-{r.pointsSpent}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
