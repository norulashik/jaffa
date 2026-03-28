"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  IoStorefront,
  IoKeypad,
  IoGift,
  IoTrophy,
  IoSettings,
  IoLogOut,
  IoPeople,
  IoCopy,
  IoRefresh,
  IoLocationSharp,
  IoCheckmarkCircle,
  IoCloseCircle,
} from "react-icons/io5";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

const apiFetch = (url: string, options: RequestInit = {}) =>
  fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...options.headers,
    },
  });

/* ------------------------------------------------------------------ */
/*  Fade / slide animation variants                                    */
/* ------------------------------------------------------------------ */
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

const stagger = {
  show: { transition: { staggerChildren: 0.07 } },
};

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function AdminDashboard() {
  /* ── auth state ── */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [venue, setVenue] = useState<any>(null);

  /* ── data state ── */
  const [stats, setStats] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchCodes, setMatchCodes] = useState<Record<string, string>>({});
  const [matchPlayers, setMatchPlayers] = useState<Record<string, number>>({});
  const [generatingCode, setGeneratingCode] = useState<string | null>(null);

  /* ── redeem ── */
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemResult, setRedeemResult] = useState<any>(null);

  /* ── login form ── */
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  /* ── register form ── */
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

  /* ── setup ── */
  const [copied, setCopied] = useState(false);
  const [rewardConfig, setRewardConfig] = useState({
    roundReward: { top1: "", top2: "", top3: "" },
    grandPrize: { top1: "", top2: "", top3: "" },
  });

  /* ================================================================ */
  /*  AUTO-LOGIN FROM LOCALSTORAGE                                     */
  /* ================================================================ */
  useEffect(() => {
    const saved = localStorage.getItem("jaffa_venue_token");
    if (saved) {
      setToken(saved);
      setIsLoggedIn(true);
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

  /* ================================================================ */
  /*  DATA LOADERS                                                     */
  /* ================================================================ */
  const loadStats = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/admin/venue/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setStats(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadRewards = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/rewards/venue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRewards(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  const loadMatchCode = useCallback(
    async (matchId: string) => {
      try {
        const res = await apiFetch(`${API_URL}/admin/match-code/${matchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.matchCode) {
            setMatchCodes((prev) => ({ ...prev, [matchId]: data.matchCode.code }));
          }
        }
      } catch {}
    },
    [token]
  );

  const loadPlayerCount = useCallback(
    async (matchId: string) => {
      try {
        const res = await apiFetch(`${API_URL}/admin/venue/players/${matchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMatchPlayers((prev) => ({ ...prev, [matchId]: data.count }));
        }
      } catch {}
    },
    [token]
  );

  const loadMatches = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/matches`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (res.ok) {
        const data = await res.json();
        setMatches(data || []);
        for (const m of data || []) {
          loadMatchCode(m.id);
          loadPlayerCount(m.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [token, loadMatchCode, loadPlayerCount]);

  /* ── auto-refresh every 15s ── */
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
  }, [isLoggedIn, token, loadStats, loadRewards, loadMatches]);

  /* ================================================================ */
  /*  AUTH HANDLERS                                                    */
  /* ================================================================ */
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
        toast.success("Location detected");
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
      const res = await apiFetch(`${API_URL}/venues/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
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
      toast.success("Registration submitted!");
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
      toast.error(err.message);
    }
  };

  const handleLogin = async () => {
    setLoginError("");
    try {
      const res = await apiFetch(`${API_URL}/venues/login`, {
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
      toast.success("Logged in successfully");
    } catch (err: any) {
      setLoginError(err.message);
      toast.error(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("jaffa_venue_token");
    localStorage.removeItem("jaffa_venue_data");
    setIsLoggedIn(false);
    setToken("");
    setVenue(null);
    setStats(null);
    setRewards([]);
    setMatches([]);
    setMatchCodes({});
    setMatchPlayers({});
    toast("Logged out");
  };

  /* ================================================================ */
  /*  MATCH CODE GENERATION                                            */
  /* ================================================================ */
  const generateCode = async (matchId: string) => {
    setGeneratingCode(matchId);
    try {
      const res = await apiFetch(`${API_URL}/admin/match-code`, {
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
        toast.success("Match code generated");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate code");
    } finally {
      setGeneratingCode(null);
    }
  };

  /* ================================================================ */
  /*  REDEEM                                                           */
  /* ================================================================ */
  const handleRedeem = async () => {
    setRedeemResult(null);
    try {
      const res = await apiFetch(`${API_URL}/rewards/redeem`, {
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
      toast.success("Reward redeemed!");
    } catch (err: any) {
      setRedeemResult({ success: false, error: err.message });
      toast.error(err.message);
    }
  };

  /* ================================================================ */
  /*  UPDATE REWARDS CONFIG                                            */
  /* ================================================================ */
  const handleUpdateRewards = async () => {
    try {
      const res = await apiFetch(`${API_URL}/venues/rewards`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rewardConfig }),
      });
      if (res.ok) {
        toast.success("Rewards updated!");
        if (venue) {
          const updatedVenue = { ...venue, rewardConfig };
          setVenue(updatedVenue);
          localStorage.setItem("jaffa_venue_data", JSON.stringify(updatedVenue));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update rewards");
    }
  };

  /* ================================================================ */
  /*  DERIVED                                                          */
  /* ================================================================ */
  const cafeUrl =
    typeof window !== "undefined" && venue?.slug
      ? `${window.location.origin}/cafe/${venue.slug}`
      : "";

  const copyLink = () => {
    if (cafeUrl) {
      navigator.clipboard.writeText(cafeUrl);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeMatches = matches.filter(
    (m) => m.status === "live" || m.status === "upcoming"
  );

  /* ================================================================ */
  /*  LOGIN / REGISTER SCREEN                                          */
  /* ================================================================ */
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
          style={{
            background: "#1a1a1a",
            border: "3px solid #ff6341",
            borderRadius: "4px",
            boxShadow: "6px 6px 0 0 #ff6341",
            padding: "2rem",
          }}
        >
          {/* Title */}
          <h1
            className="text-center mb-1"
            style={{ fontFamily: "Bungee", fontSize: "2rem", color: "#ff6341" }}
          >
            VENUE ADMIN
          </h1>
          <p
            className="text-center mb-8"
            style={{ color: "#9ca3af", fontSize: "0.85rem", fontWeight: 600 }}
          >
            JAFFA IPL Prediction Portal
          </p>

          <AnimatePresence mode="wait">
            {!showRegister ? (
              /* ── LOGIN FORM ── */
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.25 }}
              >
                <label style={{ color: "#9ca3af" }}>Phone Number</label>
                <input
                  type="tel"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="Owner phone number"
                  className="nb-input w-full px-4 py-3 mb-4 mt-1"
                />

                <label style={{ color: "#9ca3af" }}>Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter password"
                  className="nb-input w-full px-4 py-3 mb-5 mt-1"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />

                {loginError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="card-orange px-4 py-3 mb-4"
                  >
                    <p style={{ color: "#ff6341", fontSize: "0.85rem", fontWeight: 700 }}>
                      {loginError}
                    </p>
                  </motion.div>
                )}

                <button
                  onClick={handleLogin}
                  className="btn-sticker btn-orange w-full py-3 text-base"
                >
                  Login
                </button>

                <p className="text-center mt-5">
                  <button
                    onClick={() => {
                      setShowRegister(true);
                      setLoginError("");
                    }}
                    style={{
                      color: "#ff6341",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      background: "none",
                      border: "none",
                      boxShadow: "none",
                      textTransform: "none",
                    }}
                  >
                    New venue? Register here
                  </button>
                </p>
              </motion.div>
            ) : (
              /* ── REGISTER FORM ── */
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {regSuccess ? (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="card-green px-4 py-6 text-center"
                  >
                    <IoCheckmarkCircle
                      style={{ fontSize: "2.5rem", color: "#22c55e", margin: "0 auto 0.5rem" }}
                    />
                    <p style={{ color: "#22c55e", fontWeight: 700 }}>{regSuccess}</p>
                  </motion.div>
                ) : (
                  <>
                    <label style={{ color: "#9ca3af" }}>Venue / Cafe Name</label>
                    <input
                      type="text"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g. Chai Point"
                      className="nb-input w-full px-4 py-3 mb-3 mt-1"
                    />

                    <label style={{ color: "#9ca3af" }}>Owner Name</label>
                    <input
                      type="text"
                      value={regOwnerName}
                      onChange={(e) => setRegOwnerName(e.target.value)}
                      placeholder="Your full name"
                      className="nb-input w-full px-4 py-3 mb-3 mt-1"
                    />

                    <label style={{ color: "#9ca3af" }}>Phone Number</label>
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="Phone number"
                      className="nb-input w-full px-4 py-3 mb-3 mt-1"
                    />

                    <label style={{ color: "#9ca3af" }}>Password</label>
                    <input
                      type="password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="Choose a password"
                      className="nb-input w-full px-4 py-3 mb-4 mt-1"
                    />

                    <label style={{ color: "#9ca3af" }}>Location</label>
                    <div className="flex gap-2 mb-2 mt-1">
                      <input
                        type="text"
                        value={regLatitude}
                        onChange={(e) => setRegLatitude(e.target.value)}
                        placeholder="Latitude"
                        className="nb-input flex-1 px-3 py-3 text-sm"
                      />
                      <input
                        type="text"
                        value={regLongitude}
                        onChange={(e) => setRegLongitude(e.target.value)}
                        placeholder="Longitude"
                        className="nb-input flex-1 px-3 py-3 text-sm"
                      />
                    </div>
                    <button
                      onClick={detectLocation}
                      disabled={detectingLocation}
                      className="btn-secondary w-full py-2 mb-4 text-sm flex items-center justify-center gap-2"
                    >
                      <IoLocationSharp />
                      {detectingLocation ? "Detecting..." : "Detect My Location"}
                    </button>

                    {regError && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="card-orange px-4 py-3 mb-4"
                      >
                        <p style={{ color: "#ff6341", fontSize: "0.85rem", fontWeight: 700 }}>
                          {regError}
                        </p>
                      </motion.div>
                    )}

                    <button
                      onClick={handleRegister}
                      className="btn-sticker btn-orange w-full py-3 text-base"
                    >
                      Register Venue
                    </button>
                  </>
                )}

                <p className="text-center mt-5">
                  <button
                    onClick={() => {
                      setShowRegister(false);
                      setRegError("");
                      setRegSuccess("");
                    }}
                    style={{
                      color: "#ff6341",
                      fontSize: "0.85rem",
                      fontWeight: 700,
                      background: "none",
                      border: "none",
                      boxShadow: "none",
                      textTransform: "none",
                    }}
                  >
                    Already have an account? Login
                  </button>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  /* ================================================================ */
  /*  DASHBOARD                                                        */
  /* ================================================================ */
  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* ── HEADER ── */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-4 py-4 flex items-center justify-between"
        style={{
          background: "#1a1a1a",
          borderBottom: "2px solid #2a2a2a",
          boxShadow: "0 4px 0 0 #ff6341",
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "Bungee",
              fontSize: "1.3rem",
              color: "#ff6341",
              lineHeight: 1.1,
            }}
          >
            VENUE ADMIN
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "0.8rem", fontWeight: 600, marginTop: "2px" }}>
            {venue?.name || "Your Venue"}
          </p>
        </div>
        <button onClick={handleLogout} className="btn-gray px-4 py-2 text-xs flex items-center gap-2">
          <IoLogOut style={{ fontSize: "1rem" }} />
          Logout
        </button>
      </motion.header>

      {/* ── TABS ── */}
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-8">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList
            className="w-full mb-5 overflow-x-auto no-scrollbar"
            style={{
              background: "#1a1a1a",
              border: "2px solid #2a2a2a",
              borderRadius: "4px",
              boxShadow: "4px 4px 0 0 #000",
              padding: "4px",
            }}
          >
            {[
              { value: "overview", icon: <IoStorefront />, label: "Overview" },
              { value: "codes", icon: <IoKeypad />, label: "Codes" },
              { value: "redeem", icon: <IoGift />, label: "Redeem" },
              { value: "winners", icon: <IoTrophy />, label: "Winners" },
              { value: "setup", icon: <IoSettings />, label: "Setup" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs rounded-[3px] transition-all data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:shadow-[2px_2px_0_0_#000] data-[state=inactive]:text-[#9ca3af]"
                style={{ fontWeight: 900, letterSpacing: "0.04em" }}
              >
                {tab.icon} {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ============================================================ */}
          {/*  TAB 1 — OVERVIEW                                            */}
          {/* ============================================================ */}
          <TabsContent value="overview">
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
              {stats ? (
                <>
                  {/* Stat Cards */}
                  <motion.div variants={fadeUp} className="grid grid-cols-3 gap-3">
                    <div className="card-yellow px-3 py-4 text-center">
                      <div className="stat-number" style={{ color: "#ffd60a" }}>
                        {stats.totalPlayers ?? 0}
                      </div>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          color: "#ffd60a",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginTop: "4px",
                        }}
                      >
                        Total Players
                      </p>
                    </div>
                    <div className="card-blue px-3 py-4 text-center">
                      <div className="stat-number" style={{ color: "#3b9eff" }}>
                        {stats.totalRewards ?? 0}
                      </div>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          color: "#3b9eff",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginTop: "4px",
                        }}
                      >
                        Total Rewards
                      </p>
                    </div>
                    <div className="card-green px-3 py-4 text-center">
                      <div className="stat-number" style={{ color: "#22c55e" }}>
                        {stats.redeemedRewards ?? 0}
                      </div>
                      <p
                        style={{
                          fontSize: "0.7rem",
                          fontWeight: 800,
                          color: "#22c55e",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginTop: "4px",
                        }}
                      >
                        Redeemed
                      </p>
                    </div>
                  </motion.div>

                  {/* Top Players */}
                  {stats.topPlayers && stats.topPlayers.length > 0 && (
                    <motion.div variants={fadeUp} className="game-card p-4">
                      <h4
                        style={{
                          fontFamily: "Bungee",
                          fontSize: "1rem",
                          color: "#ffd60a",
                          marginBottom: "0.75rem",
                        }}
                      >
                        Top Players
                      </h4>
                      <div className="space-y-2">
                        {stats.topPlayers.map((p: any, i: number) => (
                          <div
                            key={p.rank ?? i}
                            className="flex items-center justify-between py-2 px-3"
                            style={{
                              background: i === 0 ? "#1a1600" : "#111",
                              border: "1px solid #2a2a2a",
                              borderRadius: "3px",
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={i < 3 ? "rank-badge" : "rank-badge-gray"}
                                style={{ fontSize: "0.85rem", padding: "2px 8px" }}
                              >
                                #{p.rank ?? i + 1}
                              </span>
                              <span className="player-name" style={{ fontSize: "0.85rem" }}>
                                {p.displayName}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className="info-pill"
                                style={{ color: "#22c55e" }}
                              >
                                {p.accuracy}%
                              </span>
                              <span
                                style={{
                                  fontFamily: "Bungee",
                                  fontSize: "0.85rem",
                                  color: "#ffd60a",
                                }}
                              >
                                {p.totalPoints} pts
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              ) : (
                <motion.div variants={fadeUp} className="text-center py-12">
                  <div
                    className="inline-block"
                    style={{
                      width: 24,
                      height: 24,
                      border: "3px solid #ff6341",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.6s linear infinite",
                    }}
                  />
                  <p style={{ color: "#9ca3af", marginTop: "0.75rem", fontSize: "0.9rem" }}>
                    Loading stats...
                  </p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </motion.div>
              )}

              {/* Active Matches */}
              {activeMatches.length > 0 && (
                <motion.div variants={fadeUp} className="game-card p-4">
                  <h4
                    style={{
                      fontFamily: "Bungee",
                      fontSize: "1rem",
                      color: "#ff6341",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Active Matches
                  </h4>
                  <div className="space-y-2">
                    {activeMatches.slice(0, 5).map((m: any) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between py-2 px-3"
                        style={{
                          background: "#111",
                          border: "1px solid #2a2a2a",
                          borderRadius: "3px",
                        }}
                      >
                        <div className="flex items-center gap-2">
                          {m.status === "live" && <span className="live-badge">LIVE</span>}
                          {m.status === "upcoming" && (
                            <span className="info-pill" style={{ color: "#3b9eff" }}>
                              UPCOMING
                            </span>
                          )}
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem" }}>
                            {m.team1Short || m.team1?.slice(0, 3)} vs{" "}
                            {m.team2Short || m.team2?.slice(0, 3)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5" style={{ color: "#9ca3af", fontSize: "0.8rem" }}>
                          <IoPeople />
                          <span style={{ fontWeight: 700 }}>{matchPlayers[m.id] || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </TabsContent>

          {/* ============================================================ */}
          {/*  TAB 2 — CODES                                               */}
          {/* ============================================================ */}
          <TabsContent value="codes">
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
              <motion.div variants={fadeUp}>
                <h3
                  style={{
                    fontFamily: "Bungee",
                    fontSize: "1.2rem",
                    color: "#ff6341",
                    marginBottom: "0.25rem",
                  }}
                >
                  Match Codes
                </h3>
                <p style={{ color: "#9ca3af", fontSize: "0.8rem", fontWeight: 600, marginBottom: "1rem" }}>
                  Generate a 4-digit code for each match. Users must enter this code to join from your venue.
                </p>
              </motion.div>

              {activeMatches.length === 0 && (
                <motion.div variants={fadeUp} className="game-card p-8 text-center">
                  <IoKeypad style={{ fontSize: "2rem", color: "#4b5563", margin: "0 auto 0.5rem" }} />
                  <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>No upcoming or live matches</p>
                </motion.div>
              )}

              {activeMatches.map((match: any) => {
                const startDate = match.startTime ? new Date(match.startTime) : null;
                const timeStr = startDate
                  ? startDate.toLocaleString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "";
                const code = matchCodes[match.id];

                return (
                  <motion.div key={match.id} variants={fadeUp} className="game-card p-4">
                    {/* Match Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {match.team1Img && (
                          <img
                            src={match.team1Img}
                            alt=""
                            className="w-8 h-8 rounded-full object-contain"
                            style={{ background: "#0d0d0d" }}
                          />
                        )}
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: "0.95rem" }}>
                          {match.team1Short || match.team1?.slice(0, 3)} vs{" "}
                          {match.team2Short || match.team2?.slice(0, 3)}
                        </span>
                        {match.team2Img && (
                          <img
                            src={match.team2Img}
                            alt=""
                            className="w-8 h-8 rounded-full object-contain"
                            style={{ background: "#0d0d0d" }}
                          />
                        )}
                      </div>
                      <div className="text-right">
                        {match.status === "live" ? (
                          <span className="live-badge">LIVE</span>
                        ) : (
                          <span className="info-pill" style={{ color: "#3b9eff" }}>
                            {match.status}
                          </span>
                        )}
                        {timeStr && (
                          <p style={{ color: "#6b7280", fontSize: "0.7rem", marginTop: "4px" }}>
                            {timeStr}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Code Display or Generate */}
                    {code ? (
                      <div
                        className="text-center py-4 px-3"
                        style={{
                          background: "#0d0d0d",
                          border: "2px solid #2a2a2a",
                          borderRadius: "4px",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "0.65rem",
                            fontWeight: 800,
                            color: "#6b7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            marginBottom: "6px",
                          }}
                        >
                          Match Code
                        </p>
                        <motion.div
                          key={code}
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          style={{
                            fontFamily: "Bungee",
                            fontSize: "3rem",
                            color: "#ff6341",
                            letterSpacing: "0.3em",
                            lineHeight: 1,
                          }}
                        >
                          {code}
                        </motion.div>
                        <div
                          className="flex items-center justify-center gap-4 mt-3"
                          style={{ fontSize: "0.8rem" }}
                        >
                          <span
                            className="info-pill flex items-center gap-1"
                            style={{ color: "#9ca3af" }}
                          >
                            <IoPeople /> {matchPlayers[match.id] || 0} players
                          </span>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => generateCode(match.id)}
                        disabled={generatingCode === match.id}
                        className="btn-sticker btn-orange w-full py-3 text-sm"
                      >
                        {generatingCode === match.id ? "Generating..." : "Generate Code"}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </TabsContent>

          {/* ============================================================ */}
          {/*  TAB 3 — REDEEM                                              */}
          {/* ============================================================ */}
          <TabsContent value="redeem">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="space-y-5"
            >
              <motion.div variants={fadeUp}>
                <h3
                  style={{
                    fontFamily: "Bungee",
                    fontSize: "1.2rem",
                    color: "#22c55e",
                    marginBottom: "0.5rem",
                  }}
                >
                  Redeem Reward
                </h3>
                <p style={{ color: "#9ca3af", fontSize: "0.8rem", fontWeight: 600, marginBottom: "1.5rem" }}>
                  Enter the winner&apos;s 4-digit reward code to mark it as redeemed.
                </p>
              </motion.div>

              <motion.div variants={fadeUp} className="game-card p-6">
                <div className="flex flex-col items-center gap-4">
                  <input
                    type="text"
                    value={redeemCode}
                    onChange={(e) =>
                      setRedeemCode(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="0000"
                    maxLength={4}
                    className="nb-input text-center w-full max-w-[240px] py-4"
                    style={{
                      fontFamily: "Bungee",
                      fontSize: "2.5rem",
                      letterSpacing: "0.4em",
                      background: "#0d0d0d",
                      border: "2px solid #555",
                      borderRadius: "4px",
                      color: "#fff",
                      boxShadow: "3px 3px 0 0 #22c55e",
                    }}
                    onKeyDown={(e) => e.key === "Enter" && redeemCode.length === 4 && handleRedeem()}
                  />
                  <button
                    onClick={handleRedeem}
                    disabled={redeemCode.length !== 4}
                    className="btn-sticker btn-green px-8 py-3 text-base"
                  >
                    Redeem
                  </button>
                </div>
              </motion.div>

              {/* Redeem Result */}
              <AnimatePresence>
                {redeemResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                  >
                    {redeemResult.success ? (
                      <div className="card-green p-5">
                        <div className="flex items-center gap-3">
                          <IoCheckmarkCircle style={{ fontSize: "2.5rem", color: "#22c55e", flexShrink: 0 }} />
                          <div>
                            <p
                              style={{
                                fontFamily: "Bungee",
                                fontSize: "1rem",
                                color: "#22c55e",
                                marginBottom: "4px",
                              }}
                            >
                              Redeemed Successfully!
                            </p>
                            <p style={{ color: "#fff", fontWeight: 700, fontSize: "0.9rem" }}>
                              {redeemResult.reward?.rewardText}
                            </p>
                            <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginTop: "2px" }}>
                              Player: {redeemResult.reward?.user?.displayName || redeemResult.player?.displayName || "Unknown"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="card-orange p-5">
                        <div className="flex items-center gap-3">
                          <IoCloseCircle style={{ fontSize: "2rem", color: "#ff6341", flexShrink: 0 }} />
                          <p style={{ color: "#ff6341", fontWeight: 700, fontSize: "0.9rem" }}>
                            {redeemResult.error}
                          </p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </TabsContent>

          {/* ============================================================ */}
          {/*  TAB 4 — WINNERS                                             */}
          {/* ============================================================ */}
          <TabsContent value="winners">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="space-y-3"
            >
              <motion.div variants={fadeUp}>
                <h3
                  style={{
                    fontFamily: "Bungee",
                    fontSize: "1.2rem",
                    color: "#ffd60a",
                    marginBottom: "1rem",
                  }}
                >
                  All Rewards
                </h3>
              </motion.div>

              {rewards.length === 0 && (
                <motion.div variants={fadeUp} className="game-card p-8 text-center">
                  <IoTrophy style={{ fontSize: "2rem", color: "#4b5563", margin: "0 auto 0.5rem" }} />
                  <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>No rewards generated yet</p>
                </motion.div>
              )}

              {rewards.map((r: any, i: number) => {
                const statusColor =
                  r.status === "active"
                    ? "#ff6341"
                    : r.status === "redeemed"
                    ? "#22c55e"
                    : "#6b7280";
                const statusBg =
                  r.status === "active"
                    ? "card-orange"
                    : r.status === "redeemed"
                    ? "card-green"
                    : "game-card";

                return (
                  <motion.div
                    key={r.id ?? i}
                    variants={fadeUp}
                    className={`${statusBg} p-4 flex items-center justify-between`}
                  >
                    <div>
                      <p className="player-name" style={{ fontSize: "0.9rem" }}>
                        {r.user?.displayName || "Player"}
                      </p>
                      <p style={{ color: "#9ca3af", fontSize: "0.8rem", fontWeight: 600, marginTop: "2px" }}>
                        {r.rewardText}
                      </p>
                      <p
                        style={{
                          color: "#6b7280",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          fontFamily: "monospace",
                          marginTop: "4px",
                        }}
                      >
                        Code: {r.code}
                      </p>
                    </div>
                    <span
                      style={{
                        background: statusColor,
                        color: r.status === "expired" ? "#fff" : "#000",
                        padding: "4px 12px",
                        borderRadius: "2px",
                        border: "2px solid #000",
                        fontSize: "0.7rem",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        boxShadow: "2px 2px 0 0 #000",
                      }}
                    >
                      {r.status}
                    </span>
                  </motion.div>
                );
              })}
            </motion.div>
          </TabsContent>

          {/* ============================================================ */}
          {/*  TAB 5 — SETUP                                               */}
          {/* ============================================================ */}
          <TabsContent value="setup">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="space-y-6"
            >
              {/* Cafe URL + QR */}
              {venue?.slug && (
                <motion.div variants={fadeUp} className="card-orange p-5">
                  <h4
                    style={{
                      fontFamily: "Bungee",
                      fontSize: "1rem",
                      color: "#ff6341",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Your Cafe URL
                  </h4>
                  <p style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                    Share this link with customers. They scan or tap to enter your arena.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <code
                      style={{
                        flex: 1,
                        background: "#0d0d0d",
                        color: "#ff6341",
                        padding: "10px 14px",
                        borderRadius: "3px",
                        border: "2px solid #2a2a2a",
                        fontSize: "0.8rem",
                        fontWeight: 700,
                        wordBreak: "break-all",
                      }}
                    >
                      {cafeUrl}
                    </code>
                    <button
                      onClick={copyLink}
                      className="btn-sticker btn-orange px-3 py-2.5 text-sm flex items-center gap-1"
                    >
                      <IoCopy /> {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>

                  {/* QR Code */}
                  <div
                    className="flex items-center justify-center p-4"
                    style={{
                      background: "#ffffff",
                      borderRadius: "4px",
                      border: "3px solid #000",
                      boxShadow: "4px 4px 0 0 #000",
                    }}
                  >
                    <div className="text-center">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(cafeUrl)}`}
                        alt="QR Code"
                        style={{ width: 180, height: 180, margin: "0 auto" }}
                      />
                      <p
                        style={{
                          color: "#333",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          marginTop: "8px",
                          fontFamily: "monospace",
                        }}
                      >
                        {venue.slug}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Round Rewards Config */}
              <motion.div variants={fadeUp} className="game-card p-5">
                <h4
                  style={{
                    fontFamily: "Bungee",
                    fontSize: "1rem",
                    color: "#ffd60a",
                    marginBottom: "1rem",
                  }}
                >
                  Round Rewards
                </h4>
                <p style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem" }}>
                  Set rewards for the top 3 players each round.
                </p>
                {(["top1", "top2", "top3"] as const).map((key, i) => (
                  <div key={key} className="flex items-center gap-3 mb-3">
                    <span
                      className={i === 0 ? "rank-badge" : "rank-badge-gray"}
                      style={{ fontSize: "0.8rem", padding: "2px 10px", minWidth: "42px", textAlign: "center" }}
                    >
                      #{i + 1}
                    </span>
                    <input
                      type="text"
                      value={(rewardConfig.roundReward as any)[key]}
                      onChange={(e) =>
                        setRewardConfig({
                          ...rewardConfig,
                          roundReward: { ...rewardConfig.roundReward, [key]: e.target.value },
                        })
                      }
                      placeholder={`Reward for #${i + 1} (e.g. Free coffee)`}
                      className="nb-input flex-1 px-3 py-2.5 text-sm"
                    />
                  </div>
                ))}
              </motion.div>

              {/* Grand Prize Config */}
              <motion.div variants={fadeUp} className="game-card p-5">
                <h4
                  style={{
                    fontFamily: "Bungee",
                    fontSize: "1rem",
                    color: "#3b9eff",
                    marginBottom: "1rem",
                  }}
                >
                  Grand Prize
                </h4>
                <p style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem" }}>
                  Set grand prizes for the overall match winners.
                </p>
                {(["top1", "top2", "top3"] as const).map((key, i) => (
                  <div key={key} className="flex items-center gap-3 mb-3">
                    <span
                      className={i === 0 ? "rank-badge" : "rank-badge-gray"}
                      style={{ fontSize: "0.8rem", padding: "2px 10px", minWidth: "42px", textAlign: "center" }}
                    >
                      #{i + 1}
                    </span>
                    <input
                      type="text"
                      value={(rewardConfig.grandPrize as any)[key]}
                      onChange={(e) =>
                        setRewardConfig({
                          ...rewardConfig,
                          grandPrize: { ...rewardConfig.grandPrize, [key]: e.target.value },
                        })
                      }
                      placeholder={`Grand prize for #${i + 1}`}
                      className="nb-input flex-1 px-3 py-2.5 text-sm"
                    />
                  </div>
                ))}
              </motion.div>

              {/* Save Button */}
              <motion.div variants={fadeUp}>
                <button
                  onClick={handleUpdateRewards}
                  className="btn-sticker btn-orange w-full py-3 text-base"
                >
                  Save Rewards
                </button>
              </motion.div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
