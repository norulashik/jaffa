"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { IoCheckmarkCircle, IoStatsChart, IoTicket, IoPeople, IoQrCode, IoKeypad, IoCopy, IoRefresh } from "react-icons/io5";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [venue, setVenue] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemResult, setRedeemResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "codes" | "rewards" | "redeem" | "setup">("overview");

  // Match codes
  const [matches, setMatches] = useState<any[]>([]);
  const [matchCodes, setMatchCodes] = useState<Record<string, string>>({});
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);
  const [matchPlayers, setMatchPlayers] = useState<Record<string, number>>({});

  // Login form
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Registration form
  const [showRegister, setShowRegister] = useState(false);
  const [regName, setRegName] = useState("");
  const [regOwnerName, setRegOwnerName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLatitude, setRegLatitude] = useState("");
  const [regLongitude, setRegLongitude] = useState("");
  const [regError, setRegError] = useState("");
  const [regSuccess, setRegSuccess] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Setup
  const [copied, setCopied] = useState(false);

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
      // Restore venue data from localStorage
      const savedVenue = localStorage.getItem("jaffa_venue_data");
      if (savedVenue) {
        try {
          const venueData = JSON.parse(savedVenue);
          setVenue(venueData);
          if (venueData.rewardConfig) setRewardConfig(venueData.rewardConfig);
        } catch {}
      }
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && token) {
      loadStats();
      loadRewards();
      loadMatches();
      const interval = setInterval(() => {
        loadStats();
        loadRewards();
        loadMatches();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, token]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
      setRegError("Geolocation not supported by your browser");
      return;
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRegLatitude(pos.coords.latitude.toFixed(6));
        setRegLongitude(pos.coords.longitude.toFixed(6));
        setDetectingLocation(false);
      },
      () => {
        setRegError("Failed to detect location. Please enter manually.");
        setDetectingLocation(false);
      }
    );
  };

  const handleRegister = async () => {
    setRegError("");
    setRegSuccess("");
    if (!regName || !regOwnerName || !regPhone || !regPassword || !regLatitude || !regLongitude) {
      setRegError("All fields are required");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/venues/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: regName,
          ownerName: regOwnerName,
          ownerPhone: regPhone,
          password: regPassword,
          latitude: parseFloat(regLatitude),
          longitude: parseFloat(regLongitude),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRegSuccess("Registration submitted! Your venue is pending approval. You can login once approved.");
      setTimeout(() => {
        setShowRegister(false);
        setRegSuccess("");
        setRegName("");
        setRegOwnerName("");
        setRegPhone("");
        setRegPassword("");
        setRegLatitude("");
        setRegLongitude("");
      }, 3000);
    } catch (err: any) {
      setRegError(err.message);
    }
  };

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
      if (data.venue.rewardConfig) setRewardConfig(data.venue.rewardConfig);
      localStorage.setItem("jaffa_venue_token", data.token);
      localStorage.setItem("jaffa_venue_data", JSON.stringify(data.venue));
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

  const loadMatches = async () => {
    try {
      const res = await fetch(`${API_URL}/matches`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (res.ok) {
        const data = await res.json();
        setMatches(data || []);
        // Load existing codes for each match
        for (const m of data || []) {
          loadMatchCode(m.id);
          loadPlayerCount(m.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadMatchCode = async (matchId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/match-code/${matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.matchCode) {
          setMatchCodes((prev) => ({ ...prev, [matchId]: data.matchCode.code }));
        }
      }
    } catch {}
  };

  const loadPlayerCount = async (matchId: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/venue/players/${matchId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMatchPlayers((prev) => ({ ...prev, [matchId]: data.count }));
      }
    } catch {}
  };

  const generateCode = async (matchId: string) => {
    setGeneratingCode(matchId);
    try {
      const res = await fetch(`${API_URL}/admin/match-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matchId }),
      });
      const data = await res.json();
      if (res.ok) {
        setMatchCodes((prev) => ({ ...prev, [matchId]: data.matchCode.code }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setGeneratingCode(null);
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
        // Update cached venue data with new reward config
        if (venue) {
          const updatedVenue = { ...venue, rewardConfig };
          setVenue(updatedVenue);
          localStorage.setItem("jaffa_venue_data", JSON.stringify(updatedVenue));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const cafeUrl = typeof window !== "undefined" && venue?.slug
    ? `${window.location.origin}/cafe/${venue.slug}`
    : "";

  const copyLink = () => {
    if (cafeUrl) {
      navigator.clipboard.writeText(cafeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-black text-primary-container text-center mb-2">JAFFA</h1>
          <p className="text-on-surface-variant text-center text-sm mb-8">Venue Dashboard</p>

          {!showRegister ? (
            <>
              <input
                type="tel"
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                placeholder="Owner phone number"
                className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
              />
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-primary-container"
              />

              {loginError && <p className="text-error text-sm mb-4">{loginError}</p>}

              <button
                onClick={handleLogin}
                className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold py-3 rounded-xl transition-colors shadow-[0_4px_20px_rgba(0,255,171,0.3)]"
              >
                Login
              </button>

              <p className="text-center mt-4">
                <button
                  onClick={() => { setShowRegister(true); setLoginError(""); }}
                  className="text-primary-container hover:text-primary-fixed text-sm"
                >
                  New venue? Register here
                </button>
              </p>
            </>
          ) : (
            <>
              {regSuccess ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                  <p className="text-green-400 font-medium">{regSuccess}</p>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Venue / Cafe name"
                    className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
                  />
                  <input
                    type="text"
                    value={regOwnerName}
                    onChange={(e) => setRegOwnerName(e.target.value)}
                    placeholder="Owner name"
                    className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
                  />
                  <input
                    type="tel"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Phone number"
                    className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
                  />
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
                  />

                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      value={regLatitude}
                      onChange={(e) => setRegLatitude(e.target.value)}
                      placeholder="Latitude"
                      className="flex-1 bg-surface-container-high text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary-container text-sm"
                    />
                    <input
                      type="text"
                      value={regLongitude}
                      onChange={(e) => setRegLongitude(e.target.value)}
                      placeholder="Longitude"
                      className="flex-1 bg-surface-container-high text-on-surface px-4 py-3 rounded-xl outline-none focus:ring-2 focus:ring-primary-container text-sm"
                    />
                  </div>
                  <button
                    onClick={detectLocation}
                    disabled={detectingLocation}
                    className="w-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-sm py-2 rounded-xl mb-4 transition-colors"
                  >
                    {detectingLocation ? "Detecting..." : "Use my current location"}
                  </button>

                  {regError && <p className="text-error text-sm mb-4">{regError}</p>}

                  <button
                    onClick={handleRegister}
                    className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold py-3 rounded-xl transition-colors shadow-[0_4px_20px_rgba(0,255,171,0.3)]"
                  >
                    Register Venue
                  </button>
                </>
              )}

              <p className="text-center mt-4">
                <button
                  onClick={() => { setShowRegister(false); setRegError(""); setRegSuccess(""); }}
                  className="text-primary-container hover:text-primary-fixed text-sm"
                >
                  Already have an account? Login
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-surface-container-low border-b border-white/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-container">JAFFA Admin</h1>
            <p className="text-sm text-on-surface-variant">{venue?.name || "Your Venue"}</p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("jaffa_venue_token");
              localStorage.removeItem("jaffa_venue_data");
              setIsLoggedIn(false);
            }}
            className="text-sm text-outline hover:text-on-surface"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-container-low border-b border-white/5 overflow-x-auto">
        {[
          { key: "overview", icon: <IoStatsChart />, label: "Overview" },
          { key: "codes", icon: <IoKeypad />, label: "Codes" },
          { key: "redeem", icon: <IoTicket />, label: "Redeem" },
          { key: "rewards", icon: <IoPeople />, label: "Winners" },
          { key: "setup", icon: <IoQrCode />, label: "Setup" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.key
                ? "text-primary-container border-b-2 border-primary-container"
                : "text-outline"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-2xl mx-auto">
        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-4">
            {stats && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Players" value={stats.totalPlayers} />
                  <StatCard label="Rewards" value={stats.totalRewards} />
                  <StatCard label="Redeemed" value={stats.redeemedRewards} />
                </div>

                <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
                  <h3 className="text-on-surface font-semibold mb-3">Top Players</h3>
                  <div className="space-y-2">
                    {stats.topPlayers?.map((p: any) => (
                      <div key={p.rank} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-outline w-5">#{p.rank}</span>
                          <span className="text-on-surface">{p.displayName}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-on-surface-variant text-xs">{p.accuracy}%</span>
                          <span className="text-primary-container font-medium">{p.totalPoints} pts</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Active matches with player counts */}
            {matches.filter(m => m.status === "live" || m.status === "upcoming").length > 0 && (
              <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
                <h3 className="text-on-surface font-semibold mb-3">Active Matches</h3>
                <div className="space-y-3">
                  {matches.filter(m => m.status === "live" || m.status === "upcoming").slice(0, 5).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {m.status === "live" && (
                          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        )}
                        <span className="text-on-surface text-sm">
                          {m.team1Short || m.team1?.slice(0, 3)} vs {m.team2Short || m.team2?.slice(0, 3)}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          m.status === "live" ? "bg-green-500/20 text-green-400" : "bg-surface-container-highest text-on-surface-variant"
                        }`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-on-surface-variant text-sm">
                        <IoPeople />
                        <span>{matchPlayers[m.id] || 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!stats && (
              <p className="text-on-surface-variant text-center py-8">Loading stats...</p>
            )}
          </div>
        )}

        {/* Match Codes */}
        {activeTab === "codes" && (
          <div className="space-y-4">
            <h3 className="text-on-surface font-semibold mb-2">Match Codes</h3>
            <p className="text-on-surface-variant text-xs mb-4">Generate a 4-digit code for each match. Users must enter this code to join.</p>

            {matches.filter(m => m.status === "live" || m.status === "upcoming").length === 0 && (
              <p className="text-on-surface-variant text-center py-8">No upcoming or live matches</p>
            )}

            {matches.filter(m => m.status === "live" || m.status === "upcoming").map((match: any) => {
              const startDate = match.startTime ? new Date(match.startTime) : null;
              const timeStr = startDate ? startDate.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
              const code = matchCodes[match.id];

              return (
                <div key={match.id} className="bg-surface-container-low rounded-xl p-4 border border-white/5">
                  {/* Match Info */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {match.team1Img && (
                        <img src={match.team1Img} alt="" className="w-8 h-8 rounded-full object-contain bg-surface-container-high" />
                      )}
                      <span className="text-on-surface font-medium text-sm">
                        {match.team1Short || match.team1?.slice(0, 3)} vs {match.team2Short || match.team2?.slice(0, 3)}
                      </span>
                      {match.team2Img && (
                        <img src={match.team2Img} alt="" className="w-8 h-8 rounded-full object-contain bg-surface-container-high" />
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        match.status === "live" ? "bg-green-500/20 text-green-400" : "bg-surface-container-highest text-on-surface-variant"
                      }`}>
                        {match.status}
                      </span>
                      {timeStr && <p className="text-outline text-[10px] mt-0.5">{timeStr}</p>}
                    </div>
                  </div>

                  {/* Code Display / Generate */}
                  {code ? (
                    <div className="bg-surface-container-high rounded-xl p-4 text-center">
                      <p className="text-on-surface-variant text-[10px] uppercase tracking-wider mb-1">Match Code</p>
                      <div className="text-5xl font-black text-primary-container tracking-[0.3em] font-mono">
                        {code}
                      </div>
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <span className="text-outline text-xs flex items-center gap-1">
                          <IoPeople /> {matchPlayers[match.id] || 0} players
                        </span>
                        <button
                          onClick={() => generateCode(match.id)}
                          disabled={generatingCode === match.id}
                          className="text-xs text-on-surface-variant hover:text-primary-container flex items-center gap-1 ml-3"
                        >
                          <IoRefresh /> Regenerate
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => generateCode(match.id)}
                      disabled={generatingCode === match.id}
                      className="w-full bg-primary-container hover:bg-primary-fixed-dim disabled:bg-surface-container-highest text-on-primary-container font-bold py-3 rounded-xl transition-colors shadow-[0_4px_20px_rgba(0,255,171,0.3)]"
                    >
                      {generatingCode === match.id ? "Generating..." : "Generate Code"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Redeem */}
        {activeTab === "redeem" && (
          <div>
            <h3 className="text-on-surface font-semibold mb-4">Enter Winner's Code</h3>
            <div className="flex gap-3 mb-4">
              <input
                type="text"
                value={redeemCode}
                onChange={(e) => setRedeemCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4-digit code"
                className="flex-1 bg-surface-container-high text-on-surface text-center text-2xl font-bold px-4 py-4 rounded-xl outline-none focus:ring-2 focus:ring-primary-container tracking-widest"
                maxLength={4}
              />
              <button
                onClick={handleRedeem}
                disabled={redeemCode.length !== 4}
                className="bg-green-600 hover:bg-green-700 disabled:bg-surface-container-highest text-white font-bold px-6 rounded-xl transition-colors"
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
                      <p className="text-on-surface text-sm">{redeemResult.reward?.rewardText}</p>
                      <p className="text-on-surface-variant text-xs">For: {redeemResult.reward?.user?.displayName}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-error">{redeemResult.error}</p>
                )}
              </motion.div>
            )}
          </div>
        )}

        {/* Winners list */}
        {activeTab === "rewards" && (
          <div className="space-y-2">
            <h3 className="text-on-surface font-semibold mb-4">All Rewards</h3>
            {rewards.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-surface-container-low p-3 rounded-xl border border-white/5">
                <div>
                  <p className="text-on-surface text-sm font-medium">{r.user?.displayName || "Player"}</p>
                  <p className="text-on-surface-variant text-xs">{r.rewardText} — Code: {r.code}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  r.status === "active" ? "bg-green-500/20 text-green-400" :
                  r.status === "redeemed" ? "bg-blue-500/20 text-blue-400" :
                  "bg-red-500/20 text-error"
                }`}>
                  {r.status}
                </span>
              </div>
            ))}
            {rewards.length === 0 && (
              <p className="text-on-surface-variant text-center py-8">No rewards generated yet</p>
            )}
          </div>
        )}

        {/* Setup */}
        {activeTab === "setup" && (
          <div className="space-y-6">
            {/* Cafe URL */}
            {venue?.slug && (
              <div className="bg-surface-container-low rounded-xl p-4 border border-primary-container/30">
                <h3 className="text-primary-container font-semibold mb-2">Your Cafe URL</h3>
                <p className="text-on-surface-variant text-xs mb-3">Share this link with customers. They scan/tap to enter your arena.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-primary-container text-sm break-all bg-surface-container-high p-3 rounded-lg">
                    {cafeUrl}
                  </code>
                  <button
                    onClick={copyLink}
                    className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface p-3 rounded-lg transition-colors flex-shrink-0"
                  >
                    <IoCopy className={copied ? "text-green-400" : ""} />
                  </button>
                </div>
                {copied && <p className="text-green-400 text-xs mt-1">Copied!</p>}

                {/* QR Code placeholder using a simple SVG-based approach */}
                <div className="mt-4 bg-white rounded-xl p-4 flex items-center justify-center">
                  <div className="text-center">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cafeUrl)}`}
                      alt="QR Code"
                      className="w-48 h-48 mx-auto"
                    />
                    <p className="text-outline-variant text-xs mt-2">{venue.slug}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Reward Config */}
            <div>
              <h3 className="text-on-surface font-semibold mb-4">Round Rewards (Top 3 each round)</h3>
              {["top1", "top2", "top3"].map((key, i) => (
                <div key={key} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-on-surface-variant w-8">#{i + 1}</span>
                  <input
                    type="text"
                    value={(rewardConfig.roundReward as any)[key]}
                    onChange={(e) =>
                      setRewardConfig({
                        ...rewardConfig,
                        roundReward: { ...rewardConfig.roundReward, [key]: e.target.value },
                      })
                    }
                    className="flex-1 bg-surface-container-high text-on-surface px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary-container text-sm"
                    placeholder={`Reward for #${i + 1}`}
                  />
                </div>
              ))}
            </div>

            <div>
              <h3 className="text-on-surface font-semibold mb-4">Grand Prize (Match winner)</h3>
              {["top1", "top2", "top3"].map((key, i) => (
                <div key={key} className="flex items-center gap-3 mb-3">
                  <span className="text-sm text-on-surface-variant w-8">#{i + 1}</span>
                  <input
                    type="text"
                    value={(rewardConfig.grandPrize as any)[key]}
                    onChange={(e) =>
                      setRewardConfig({
                        ...rewardConfig,
                        grandPrize: { ...rewardConfig.grandPrize, [key]: e.target.value },
                      })
                    }
                    className="flex-1 bg-surface-container-high text-on-surface px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary-container text-sm"
                    placeholder={`Grand prize for #${i + 1}`}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={handleUpdateRewards}
              className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold py-3 rounded-xl transition-colors shadow-[0_4px_20px_rgba(0,255,171,0.3)]"
            >
              Save Rewards
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-white/5 text-center">
      <div className="text-2xl font-bold text-on-surface">{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}
