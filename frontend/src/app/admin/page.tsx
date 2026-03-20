"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { IoCheckmarkCircle, IoStatsChart, IoTicket, IoPeople, IoQrCode } from "react-icons/io5";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [venue, setVenue] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemResult, setRedeemResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "rewards" | "redeem" | "setup">("overview");

  // Login form
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Reward config form
  const [rewardConfig, setRewardConfig] = useState({
    roundReward: { top1: "", top2: "", top3: "" },
    grandPrize: { top1: "", top2: "", top3: "" },
  });

  useEffect(() => {
    const saved = localStorage.getItem("jaffa_venue_token");
    if (saved) {
      setToken(saved);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && token) {
      loadStats();
      loadRewards();
    }
  }, [isLoggedIn, token]);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/venues/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPhone: loginPhone, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setToken(data.token);
      setVenue(data.venue);
      setRewardConfig(data.venue.rewardConfig);
      localStorage.setItem("jaffa_venue_token", data.token);
      setIsLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/venue/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadRewards = async () => {
    try {
      const res = await fetch(`${API_URL}/rewards/venue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRewards(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const handleRedeem = async () => {
    setRedeemResult(null);
    try {
      const res = await fetch(`${API_URL}/rewards/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: redeemCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setRedeemResult({ success: true, ...data });
      setRedeemCode("");
      loadRewards();
    } catch (err: any) {
      setRedeemResult({ success: false, error: err.message });
    }
  };

  const handleUpdateRewards = async () => {
    try {
      const res = await fetch(`${API_URL}/venues/rewards`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardConfig }),
      });
      if (res.ok) {
        alert("Rewards updated!");
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-black text-orange-500 text-center mb-2">JAFFA</h1>
          <p className="text-slate-400 text-center text-sm mb-8">Venue Dashboard</p>

          <input
            type="tel"
            value={loginPhone}
            onChange={(e) => setLoginPhone(e.target.value)}
            placeholder="Owner phone number"
            className="w-full bg-slate-800 text-white px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-slate-800 text-white px-4 py-3 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-orange-500"
          />

          {loginError && <p className="text-red-400 text-sm mb-4">{loginError}</p>}

          <button
            onClick={handleLogin}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">JAFFA Admin</h1>
            <p className="text-sm text-slate-400">{venue?.name || "Your Venue"}</p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("jaffa_venue_token");
              setIsLoggedIn(false);
            }}
            className="text-sm text-slate-500 hover:text-white"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900 border-b border-slate-800 overflow-x-auto">
        {[
          { key: "overview", icon: <IoStatsChart />, label: "Overview" },
          { key: "redeem", icon: <IoTicket />, label: "Redeem" },
          { key: "rewards", icon: <IoPeople />, label: "Winners" },
          { key: "setup", icon: <IoQrCode />, label: "Setup" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.key
                ? "text-orange-500 border-b-2 border-orange-500"
                : "text-slate-500"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Overview */}
        {activeTab === "overview" && stats && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Players" value={stats.totalPlayers} />
              <StatCard label="Rewards" value={stats.totalRewards} />
              <StatCard label="Redeemed" value={stats.redeemedRewards} />
            </div>

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800">
              <h3 className="text-white font-semibold mb-3">Top Players</h3>
              <div className="space-y-2">
                {stats.topPlayers?.map((p: any) => (
                  <div key={p.rank} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 w-5">#{p.rank}</span>
                      <span className="text-white">{p.displayName}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-xs">{p.accuracy}%</span>
                      <span className="text-orange-400 font-medium">{p.totalPoints} pts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Redeem */}
        {activeTab === "redeem" && (
          <div>
            <h3 className="text-white font-semibold mb-4">Enter Winner's Code</h3>
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4-digit code"
                className="flex-1 bg-slate-800 text-white text-center text-2xl font-bold px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 tracking-widest"
                maxLength={4}
              />
              <button
                onClick={handleRedeem}
                disabled={redeemCode.length !== 4}
                className="bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white font-bold px-6 rounded-xl transition-colors"
              >
                Redeem
              </button>
            </div>

            {redeemResult && (
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`p-4 rounded-xl border ${
                  redeemResult.success
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}
              >
                {redeemResult.success ? (
                  <div className="flex items-center gap-3">
                    <IoCheckmarkCircle className="text-3xl text-green-400" />
                    <div>
                      <p className="text-green-400 font-semibold">Redeemed!</p>
                      <p className="text-white text-sm">{redeemResult.reward?.rewardText}</p>
                      <p className="text-slate-400 text-xs">For: {redeemResult.reward?.user?.displayName}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-red-400">{redeemResult.error}</p>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* Winners list */}
        {activeTab === "rewards" && (
          <div className="space-y-2">
            <h3 className="text-white font-semibold mb-4">All Rewards</h3>
            {rewards.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800">
                <div>
                  <p className="text-white text-sm font-medium">{r.user?.displayName || "Player"}</p>
                  <p className="text-slate-400 text-xs">{r.rewardText} — Code: {r.code}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  r.status === "active" ? "bg-green-500/20 text-green-400" :
                  r.status === "redeemed" ? "bg-blue-500/20 text-blue-400" :
                  "bg-red-500/20 text-red-400"
                }`}>
                  {r.status}
                </span>
              </div>
            ))}
            {rewards.length === 0 && (
              <p className="text-slate-400 text-center py-8">No rewards generated yet</p>
            )}
          </div>
        )}

        {/* Setup */}
        {activeTab === "setup" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-white font-semibold mb-4">Round Rewards (Top 3 each round)</h3>
              {["top1", "top2", "top3"].map((key, i) => (
                <div key={key} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-slate-400 w-8">#{i + 1}</span>
                  <input
                    type="text"
                    value={(rewardConfig.roundReward as any)[key]}
                    onChange={(e) =>
                      setRewardConfig({
                        ...rewardConfig,
                        roundReward: { ...rewardConfig.roundReward, [key]: e.target.value },
                      })
                    }
                    className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    placeholder={`Reward for #${i + 1}`}
                  />
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-white font-semibold mb-4">Grand Prize (Match winner)</h3>
              {["top1", "top2", "top3"].map((key, i) => (
                <div key={key} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-slate-400 w-8">#{i + 1}</span>
                  <input
                    type="text"
                    value={(rewardConfig.grandPrize as any)[key]}
                    onChange={(e) =>
                      setRewardConfig({
                        ...rewardConfig,
                        grandPrize: { ...rewardConfig.grandPrize, [key]: e.target.value },
                      })
                    }
                    className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                    placeholder={`Grand prize for #${i + 1}`}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleUpdateRewards}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors"
            >
              Save Rewards
            </button>

            <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 mt-6">
              <h3 className="text-white font-semibold mb-2">QR Code Link</h3>
              <p className="text-slate-400 text-xs mb-2">Share this link or generate a QR code from it:</p>
              <code className="text-orange-400 text-sm break-all block bg-slate-800 p-3 rounded-lg">
                {typeof window !== "undefined" ? window.location.origin : ""}/?v={venue?.id}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}
