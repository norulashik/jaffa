"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants, type Easing } from "framer-motion";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  IoStatsChart,
  IoStorefront,
  IoTrophy,
  IoSettings,
  IoCheckmarkCircle,
  IoCloseCircle,
  IoArrowBack,
  IoSearch,
  IoRefresh,
  IoEye,
  IoPeople,
} from "react-icons/io5";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

type Tab = "dashboard" | "venues" | "venue-detail" | "matches" | "tools" | "sim" | "kong";

type SimSnapshot = {
  status: "idle" | "running" | "cooldown";
  matchId: string | null;
  currentBallIndex: number;
  totalBalls: number;
  currentOver: number;
  currentInnings: number;
  innings1Score: { runs: number; wickets: number; overs: number };
  innings2Score: { runs: number; wickets: number; overs: number };
  cooldownEndsAt: number | null;
};

type KongOptionDraft = { label: string; points: string };

type KongPrediction = {
  id: string;
  matchId: string;
  question: string;
  status: "open" | "locked" | "resolved" | "voided";
  correctOption?: string | null;
  options: { key: string; label: string; points: number }[];
  responses: Record<string, number>;
  totalResponses: number;
  createdAt: string;
};

/* ══════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ══════════════════════════════════════════════════════════════ */

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: "easeOut" as Easing },
  }),
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    approved: { bg: "bg-[#22c55e]/20", text: "text-[#22c55e]" },
    pending: { bg: "bg-[#ffd60a]/20", text: "text-[#ffd60a]" },
    rejected: { bg: "bg-[#ff6341]/20", text: "text-[#ff6341]" },
    inactive: { bg: "bg-[#6b7280]/20", text: "text-[#9ca3af]" },
  };
  const s = map[status] || map.inactive;
  return (
    <span
      className={`text-[11px] px-2.5 py-1 rounded-[2px] font-black uppercase tracking-wider border ${s.bg} ${s.text}`}
      style={{ borderColor: "currentColor" }}
    >
      {status}
    </span>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  if (status === "live") return <span className="live-badge text-[10px]">LIVE</span>;
  if (status === "completed")
    return (
      <span className="info-pill text-[10px] text-[#9ca3af]">Completed</span>
    );
  return <span className="info-pill text-[10px] text-[#3b9eff]">{status}</span>;
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════ */

export default function OwnerPortal() {
  /* ── Auth state ──────────────────────────────────────────── */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  /* ── Login form ──────────────────────────────────────────── */
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  /* ── Dashboard ───────────────────────────────────────────── */
  const [stats, setStats] = useState<any>(null);

  /* ── Venues ──────────────────────────────────────────────── */
  const [venues, setVenues] = useState<any[]>([]);
  const [venueFilter, setVenueFilter] = useState("all");
  const [venueSearch, setVenueSearch] = useState("");
  const [venueLoading, setVenueLoading] = useState(false);

  /* ── Venue Detail ────────────────────────────────────────── */
  const [selectedVenue, setSelectedVenue] = useState<any>(null);
  const [venueDetail, setVenueDetail] = useState<any>(null);
  const [venueMatches, setVenueMatches] = useState<any[]>([]);
  const [venueLeaderboard, setVenueLeaderboard] = useState<any[]>([]);
  const [venueRewards, setVenueRewards] = useState<any[]>([]);

  /* ── Matches ─────────────────────────────────────────────── */
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [fetchingFixtures, setFetchingFixtures] = useState(false);

  /* ── Tools ───────────────────────────────────────────────── */
  const [pollResult, setPollResult] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [resolvePredId, setResolvePredId] = useState("");
  const [resolveOption, setResolveOption] = useState("");
  const [resolveResult, setResolveResult] = useState<any>(null);

  /* ── Sim ─────────────────────────────────────────────────── */
  const [simSnapshot, setSimSnapshot] = useState<SimSnapshot | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  /* ── Kong ────────────────────────────────────────────────── */
  const [kongMatchId, setKongMatchId] = useState("");
  const [kongQuestion, setKongQuestion] = useState("");
  const [kongOptions, setKongOptions] = useState<KongOptionDraft[]>([
    { label: "", points: "50" },
    { label: "", points: "30" },
  ]);
  const [kongList, setKongList] = useState<KongPrediction[]>([]);
  const [kongFiring, setKongFiring] = useState(false);
  const [kongResolvingId, setKongResolvingId] = useState<string | null>(null);

  /* ── ownerFetch helper ───────────────────────────────────── */
  const ownerFetch = useCallback(
    async (path: string, options: RequestInit = {}) => {
      return fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "true",
          ...options.headers,
        },
      });
    },
    [token]
  );

  /* ── Auto-login from localStorage ────────────────────────── */
  useEffect(() => {
    const saved = localStorage.getItem("jaffa_owner_token");
    if (saved) {
      setToken(saved);
      setIsLoggedIn(true);
    }
  }, []);

  /* ── Data loaders ────────────────────────────────────────── */
  const loadStats = useCallback(async () => {
    try {
      const res = await ownerFetch("/owner/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [ownerFetch]);

  const loadVenues = useCallback(async () => {
    setVenueLoading(true);
    try {
      const params = new URLSearchParams();
      if (venueFilter !== "all") params.set("status", venueFilter);
      if (venueSearch) params.set("search", venueSearch);
      const res = await ownerFetch(`/owner/venues?${params}`);
      if (res.ok) setVenues(await res.json());
    } catch {}
    setVenueLoading(false);
  }, [ownerFetch, venueFilter, venueSearch]);

  const loadMatches = useCallback(async () => {
    try {
      const res = await ownerFetch("/owner/matches");
      if (!res.ok) return;
      const data = await res.json();
      // /owner/matches returns {matches, page, pageSize, totalCount, totalPages}.
      // Storing the whole object as state crashed the Matches tab with
      // "K.map is not a function" since the consumer expects an array.
      // Tolerate either shape so a future endpoint refactor doesn't reintroduce
      // the regression.
      setMatches(Array.isArray(data) ? data : Array.isArray(data?.matches) ? data.matches : []);
    } catch {}
  }, [ownerFetch]);

  /* ── Sim loaders/actions ──────────────────────────────────── */
  const loadSimState = useCallback(async () => {
    try {
      const res = await ownerFetch("/owner/sim/state");
      if (res.ok) setSimSnapshot(await res.json());
    } catch {}
  }, [ownerFetch]);

  const simAction = async (action: "start" | "stop" | "reset") => {
    setSimBusy(true);
    try {
      const res = await ownerFetch(`/owner/sim/${action}`, { method: "POST" });
      if (res.ok) {
        setSimSnapshot(await res.json());
        toast.success(`Sim ${action} ok`);
        loadMatches();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Sim ${action} failed`);
      }
    } catch (err: any) {
      toast.error(err?.message || `Sim ${action} failed`);
    } finally {
      setSimBusy(false);
    }
  };

  /* ── Kong loaders/actions ─────────────────────────────────── */
  const loadKong = useCallback(async (mid: string) => {
    if (!mid) { setKongList([]); return; }
    try {
      const res = await ownerFetch(`/owner/kong/${mid}`);
      if (res.ok) {
        const data = await res.json();
        setKongList(data.predictions || []);
      }
    } catch {}
  }, [ownerFetch]);

  const fireKong = async () => {
    if (!kongMatchId) { toast.error("Pick a match"); return; }
    if (!kongQuestion.trim()) { toast.error("Question required"); return; }
    const cleaned = kongOptions
      .map((o) => ({ label: o.label.trim(), points: Number(o.points) }))
      .filter((o) => o.label.length > 0);
    if (cleaned.length < 2) { toast.error("Need ≥2 options"); return; }
    if (cleaned.some((o) => !Number.isFinite(o.points) || o.points < 1 || o.points > 500)) {
      toast.error("Each option's points must be 1–500");
      return;
    }
    setKongFiring(true);
    try {
      const res = await ownerFetch(`/owner/kong/${kongMatchId}`, {
        method: "POST",
        body: JSON.stringify({ question: kongQuestion.trim(), options: cleaned }),
      });
      if (res.ok) {
        toast.success("Kong fired");
        setKongQuestion("");
        setKongOptions([{ label: "", points: "50" }, { label: "", points: "30" }]);
        loadKong(kongMatchId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to fire Kong");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to fire Kong");
    } finally {
      setKongFiring(false);
    }
  };

  const resolveKong = async (predictionId: string, optionKey: string) => {
    setKongResolvingId(predictionId);
    try {
      const res = await ownerFetch(`/owner/kong/${predictionId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ correctOption: optionKey }),
      });
      if (res.ok) {
        toast.success("Resolved — points awarded");
        loadKong(kongMatchId);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Resolve failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Resolve failed");
    } finally {
      setKongResolvingId(null);
    }
  };

  /* ── Auto-refresh every 15s ──────────────────────────────── */
  useEffect(() => {
    if (isLoggedIn && token) {
      loadStats();
      loadVenues();
      loadMatches();
      loadSimState();
      const interval = setInterval(() => {
        loadStats();
        loadVenues();
        loadMatches();
        loadSimState();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, token, loadStats, loadVenues, loadMatches, loadSimState]);

  /* Reload Kong list when admin switches selected match in Kong tab. */
  useEffect(() => {
    if (isLoggedIn && token && kongMatchId) {
      loadKong(kongMatchId);
      const interval = setInterval(() => loadKong(kongMatchId), 8000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, token, kongMatchId, loadKong]);

  /* ── Venue filter/search triggers reload ─────────────────── */
  useEffect(() => {
    if (isLoggedIn && token) loadVenues();
  }, [venueFilter, venueSearch]);

  /* ── Venue detail loader ─────────────────────────────────── */
  const loadVenueDetail = async (venue: any) => {
    setSelectedVenue(venue);
    setActiveTab("venue-detail");
    try {
      const [detailRes, matchesRes, lbRes, rewardsRes] = await Promise.all([
        ownerFetch(`/owner/venues/${venue.id}/detail`),
        ownerFetch(`/owner/venues/${venue.id}/matches`),
        ownerFetch(`/owner/venues/${venue.id}/leaderboard`),
        ownerFetch(`/owner/venues/${venue.id}/rewards`),
      ]);
      if (detailRes.ok) setVenueDetail(await detailRes.json());
      if (matchesRes.ok) setVenueMatches(await matchesRes.json());
      if (lbRes.ok) {
        const data = await lbRes.json();
        // /owner/venues/:id/leaderboard returns {leaderboard, page, pageSize, …}.
        // Same paginated-wrap mistake as /owner/matches; extract the array.
        setVenueLeaderboard(Array.isArray(data) ? data : Array.isArray(data?.leaderboard) ? data.leaderboard : []);
      }
      if (rewardsRes.ok) setVenueRewards(await rewardsRes.json());
    } catch {}
  };

  /* ══════════════════════════════════════════════════════════
     AUTH ACTIONS
     ══════════════════════════════════════════════════════════ */

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_URL}/owner/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      setToken(data.token);
      localStorage.setItem("jaffa_owner_token", data.token);
      setIsLoggedIn(true);
      toast.success("Logged in successfully");
    } catch (err: any) {
      toast.error(err.message || "Login failed");
    }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("jaffa_owner_token");
    setIsLoggedIn(false);
    setToken("");
    setStats(null);
    setVenues([]);
    setMatches([]);
    toast("Logged out");
  };

  /* ══════════════════════════════════════════════════════════
     VENUE ACTIONS
     ══════════════════════════════════════════════════════════ */

  const venueAction = async (venueId: string, action: string) => {
    try {
      const res = await ownerFetch(`/owner/venues/${venueId}/${action}`, {
        method: "PATCH",
      });
      if (res.ok) {
        toast.success(`Venue ${action}d successfully`);
        loadVenues();
        loadStats();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || `Failed to ${action} venue`);
      }
    } catch {
      toast.error(`Failed to ${action} venue`);
    }
  };

  /* ══════════════════════════════════════════════════════════
     MATCH / FIXTURE ACTIONS
     ══════════════════════════════════════════════════════════ */

  const fetchFixtures = async () => {
    setFetchingFixtures(true);
    try {
      const res = await ownerFetch("/owner/cricket/fixtures");
      if (res.ok) {
        const data = await res.json();
        setFixtures(data);
        toast.success(`Fetched ${data.length} fixture(s)`);
      } else {
        toast.error("Failed to fetch fixtures");
      }
    } catch {
      toast.error("Failed to fetch fixtures");
    }
    setFetchingFixtures(false);
  };

  const importFixture = async (fixtureId: string) => {
    setImporting(fixtureId);
    try {
      const res = await ownerFetch(`/owner/cricket/import/${fixtureId}`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("Fixture imported");
        loadMatches();
      } else {
        toast.error("Import failed");
      }
    } catch {
      toast.error("Import failed");
    }
    setImporting(null);
  };

  /* ══════════════════════════════════════════════════════════
     TOOLS ACTIONS
     ══════════════════════════════════════════════════════════ */

  const triggerPoll = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await ownerFetch("/owner/cricket/poll", { method: "POST" });
      const data = await res.json();
      const msg = data.message || "Done";
      setPollResult(msg);
      toast.success(msg);
    } catch (err: any) {
      const msg = "Failed: " + err.message;
      setPollResult(msg);
      toast.error(msg);
    }
    setPolling(false);
  };

  const handleResolve = async () => {
    setResolveResult(null);
    try {
      const res = await ownerFetch(
        `/owner/predictions/${resolvePredId}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({ correctOption: resolveOption }),
        }
      );
      const data = await res.json();
      setResolveResult({
        success: res.ok,
        message: data.message || data.error,
      });
      if (res.ok) {
        toast.success(data.message || "Prediction resolved");
        setResolvePredId("");
        setResolveOption("");
      } else {
        toast.error(data.error || "Resolution failed");
      }
    } catch (err: any) {
      setResolveResult({ success: false, message: err.message });
      toast.error(err.message);
    }
  };

  /* nb-input inline style helper */
  const nbInputStyle: React.CSSProperties = {
    background: "#0d0d0d",
    border: "2px solid #555",
    borderRadius: "4px",
    color: "#fff",
    boxShadow: "3px 3px 0 0 #ff6341",
  };

  /* ══════════════════════════════════════════════════════════
     LOGIN SCREEN
     ══════════════════════════════════════════════════════════ */

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-sm p-8"
          style={{
            background: "#1a1a1a",
            border: "3px solid #ff6341",
            borderRadius: "4px",
            boxShadow: "6px 6px 0 0 #ff6341",
          }}
        >
          <h1
            className="text-4xl text-center mb-1 text-[#ff6341]"
            style={{ fontFamily: "Bungee" }}
          >
            JAFFA
          </h1>
          <p
            className="text-center text-[#ffd60a] text-sm mb-8 font-black uppercase tracking-widest"
            style={{ fontFamily: "Bungee" }}
          >
            Owner Portal
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="Enter username"
                className="w-full px-4 py-3 nb-input"
                style={nbInputStyle}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div>
              <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-3 nb-input"
                style={nbInputStyle}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loginLoading || !loginUser || !loginPass}
              className="btn-sticker btn-orange w-full py-3 text-base mt-2"
            >
              {loginLoading ? "Logging in..." : "Login"}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════
     MAIN DASHBOARD LAYOUT
     ══════════════════════════════════════════════════════════ */

  /* Determine the visible Radix tab value (venue-detail maps to venues) */
  const tabValue =
    activeTab === "venue-detail" ? "venues" : activeTab;

  return (
    <div className="min-h-screen bg-[#0d0d0d]">
      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-4 py-5 flex items-center justify-between"
        style={{
          background: "#1a1a1a",
          borderBottom: "2px solid #2a2a2a",
          boxShadow: "0 4px 0 0 #ff6341",
        }}
      >
        <div>
          <h1
            className="text-2xl text-[#ff6341] leading-none"
            style={{ fontFamily: "Bungee" }}
          >
            JAFFA OWNER
          </h1>
          <p className="text-[#9ca3af] text-xs font-bold uppercase tracking-wider mt-1">
            Super Admin
          </p>
        </div>
        <button onClick={handleLogout} className="btn-gray px-4 py-2 text-xs">
          Logout
        </button>
      </motion.div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs
        value={tabValue}
        onValueChange={(v) => setActiveTab(v as Tab)}
        className="w-full"
      >
        <TabsList className="w-full rounded-none border-b-2 border-[#2a2a2a] bg-[#1a1a1a] p-0 h-auto">
          {[
            { value: "dashboard", icon: <IoStatsChart />, label: "Dashboard" },
            { value: "venues", icon: <IoStorefront />, label: "Venues" },
            { value: "matches", icon: <IoTrophy />, label: "Matches" },
            { value: "sim", icon: <IoRefresh />, label: "Sim" },
            { value: "kong", icon: <IoEye />, label: "Kong" },
            { value: "tools", icon: <IoSettings />, label: "Tools" },
          ].map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="flex-1 rounded-none border-none px-4 py-3 text-sm font-black uppercase tracking-wide text-[#9ca3af] data-[state=active]:bg-[#ff6341] data-[state=active]:text-black data-[state=active]:shadow-none transition-colors"
            >
              <span className="flex items-center gap-1.5">
                {t.icon} {t.label}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="p-4 max-w-4xl mx-auto">
          {/* ════════════════════════════════════════════════
             DASHBOARD TAB
             ════════════════════════════════════════════════ */}
          <TabsContent value="dashboard">
            <AnimatePresence mode="wait">
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                {stats ? (
                  <>
                    {/* Pending alert banner */}
                    {stats.pendingVenues > 0 && (
                      <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="card-orange p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <IoStorefront className="text-[#ff6341] text-2xl" />
                          <span className="text-[#ff6341] font-black text-sm uppercase">
                            {stats.pendingVenues} venue(s) awaiting approval
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setVenueFilter("pending");
                            setActiveTab("venues");
                          }}
                          className="btn-sticker btn-orange px-4 py-1.5 text-xs"
                        >
                          Review
                        </button>
                      </motion.div>
                    )}

                    {/* Stats row 1 */}
                    <div className="grid grid-cols-3 gap-4">
                      <motion.div
                        custom={0}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-yellow p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#ffd60a]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.totalVenues ?? 0}
                        </div>
                        <div className="text-xs text-[#ffd60a]/70 font-bold uppercase mt-1">
                          Total Venues
                        </div>
                      </motion.div>
                      <motion.div
                        custom={1}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-blue p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#3b9eff]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.activeVenues ?? 0}
                        </div>
                        <div className="text-xs text-[#3b9eff]/70 font-bold uppercase mt-1">
                          Active Venues
                        </div>
                      </motion.div>
                      <motion.div
                        custom={2}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-green p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#22c55e]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.pendingVenues ?? 0}
                        </div>
                        <div className="text-xs text-[#22c55e]/70 font-bold uppercase mt-1">
                          Pending Venues
                        </div>
                      </motion.div>
                    </div>

                    {/* Stats row 2 */}
                    <div className="grid grid-cols-3 gap-4">
                      <motion.div
                        custom={3}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-orange p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#ff6341]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.totalPlayers ?? 0}
                        </div>
                        <div className="text-xs text-[#ff6341]/70 font-bold uppercase mt-1">
                          Total Players
                        </div>
                      </motion.div>
                      <motion.div
                        custom={4}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-yellow p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#ffd60a]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.totalMatches ?? 0}
                        </div>
                        <div className="text-xs text-[#ffd60a]/70 font-bold uppercase mt-1">
                          Total Matches
                        </div>
                      </motion.div>
                      <motion.div
                        custom={5}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="card-blue p-5 text-center"
                      >
                        <div
                          className="text-3xl text-[#3b9eff]"
                          style={{ fontFamily: "Bungee" }}
                        >
                          {stats.totalPredictions ?? 0}
                        </div>
                        <div className="text-xs text-[#3b9eff]/70 font-bold uppercase mt-1">
                          Total Predictions
                        </div>
                      </motion.div>
                    </div>

                    {/* Live matches indicator */}
                    {stats.liveMatches > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="card-green p-4 flex items-center gap-3"
                      >
                        <span className="live-badge">{stats.liveMatches} LIVE</span>
                        <span className="text-[#22c55e] font-bold text-sm">
                          match(es) in progress
                        </span>
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-16">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="inline-block"
                    >
                      <IoRefresh className="text-[#ff6341] text-3xl" />
                    </motion.div>
                    <p className="text-[#9ca3af] mt-3 font-bold uppercase text-sm">
                      Loading stats...
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* ════════════════════════════════════════════════
             VENUES TAB
             ════════════════════════════════════════════════ */}
          <TabsContent value="venues">
            <AnimatePresence mode="wait">
              {activeTab === "venue-detail" && selectedVenue ? (
                /* ──── Venue Detail Sub-View ──────────────── */
                <motion.div
                  key="venue-detail"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-5"
                >
                  {/* Back button */}
                  <button
                    onClick={() => setActiveTab("venues")}
                    className="btn-gray px-4 py-2 text-xs flex items-center gap-2"
                  >
                    <IoArrowBack /> Back to Venues
                  </button>

                  {/* Venue info card */}
                  <div className="game-card p-5">
                    <h3
                      className="text-xl text-white mb-1"
                      style={{ fontFamily: "Bungee" }}
                    >
                      {selectedVenue.name}
                    </h3>
                    <p className="text-[#9ca3af] text-sm font-bold">
                      {selectedVenue.ownerName} / {selectedVenue.ownerPhone}
                    </p>
                    <div className="flex gap-3 mt-3">
                      <StatusBadge status={selectedVenue.approvalStatus} />
                      {selectedVenue.isActive ? (
                        <span className="info-pill text-[#22c55e] text-[11px]">
                          Active
                        </span>
                      ) : (
                        <span className="info-pill text-[#9ca3af] text-[11px]">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Venue stats grid */}
                  {venueDetail && (
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Players", value: venueDetail.totalPlayers, card: "card-orange" },
                        { label: "Matches", value: venueDetail.totalMatches, card: "card-blue" },
                        { label: "Rewards", value: venueDetail.totalRewards, card: "card-yellow" },
                        { label: "Redeemed", value: venueDetail.redeemedRewards, card: "card-green" },
                      ].map((s, i) => (
                        <motion.div
                          key={s.label}
                          custom={i}
                          variants={cardVariants}
                          initial="hidden"
                          animate="visible"
                          className={`${s.card} p-4 text-center`}
                        >
                          <div
                            className="text-2xl text-white"
                            style={{ fontFamily: "Bungee" }}
                          >
                            {s.value ?? 0}
                          </div>
                          <div className="text-[10px] text-[#9ca3af] font-bold uppercase mt-1">
                            {s.label}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Venue Matches list */}
                  <div className="game-card p-5">
                    <h4
                      className="text-sm text-white font-black uppercase mb-3"
                      style={{ fontFamily: "Bungee" }}
                    >
                      Matches ({venueMatches.length})
                    </h4>
                    {venueMatches.length === 0 && (
                      <p className="text-[#9ca3af] text-xs">No matches yet</p>
                    )}
                    <div className="space-y-2">
                      {venueMatches.map((m: any) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between py-2 border-b border-[#2a2a2a] last:border-none"
                        >
                          <div>
                            <span className="text-white text-sm font-bold">
                              {m.team1Short || m.team1} vs{" "}
                              {m.team2Short || m.team2}
                            </span>
                            <MatchStatusBadge status={m.status} />
                          </div>
                          <span className="text-[#9ca3af] text-xs flex items-center gap-1 font-bold">
                            <IoPeople /> {m.playerCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Players list */}
                  <div className="game-card p-5">
                    <h4
                      className="text-sm text-white font-black uppercase mb-3"
                      style={{ fontFamily: "Bungee" }}
                    >
                      Top Players
                    </h4>
                    {venueLeaderboard.length === 0 && (
                      <p className="text-[#9ca3af] text-xs">No players yet</p>
                    )}
                    <div className="space-y-2">
                      {venueLeaderboard.slice(0, 20).map((p: any) => (
                        <div
                          key={p.rank}
                          className="flex items-center justify-between py-2 border-b border-[#2a2a2a] last:border-none"
                        >
                          <div className="flex items-center gap-3">
                            {p.rank <= 3 ? (
                              <span className="rank-badge text-sm w-8 text-center">
                                {p.rank}
                              </span>
                            ) : (
                              <span className="rank-badge-gray text-sm w-8 text-center">
                                {p.rank}
                              </span>
                            )}
                            <span className="text-white text-sm font-bold">
                              {p.displayName}
                            </span>
                          </div>
                          <span className="text-[#ffd60a] font-black text-sm">
                            {p.totalPoints} pts
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Rewards list */}
                  <div className="game-card p-5">
                    <h4
                      className="text-sm text-white font-black uppercase mb-3"
                      style={{ fontFamily: "Bungee" }}
                    >
                      Rewards ({venueRewards.length})
                    </h4>
                    {venueRewards.length === 0 && (
                      <p className="text-[#9ca3af] text-xs">No rewards yet</p>
                    )}
                    <div className="space-y-2">
                      {venueRewards.slice(0, 20).map((r: any) => (
                        <div
                          key={r.id}
                          className="flex items-center justify-between py-2 border-b border-[#2a2a2a] last:border-none"
                        >
                          <div>
                            <span className="text-white text-sm font-bold">
                              {r.user?.displayName || "Player"}
                            </span>
                            <span className="text-[#9ca3af] text-xs ml-2">
                              {r.rewardText}
                            </span>
                          </div>
                          <StatusBadge
                            status={
                              r.status === "active"
                                ? "approved"
                                : r.status === "redeemed"
                                ? "pending"
                                : "rejected"
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* ──── Venue List View ────────────────────── */
                <motion.div
                  key="venue-list"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-5"
                >
                  {/* Filter buttons */}
                  <div className="flex gap-3 flex-wrap">
                    {[
                      { key: "all", cls: "btn-orange" },
                      { key: "pending", cls: "btn-yellow" },
                      { key: "approved", cls: "btn-green" },
                      { key: "rejected", cls: "btn-orange" },
                    ].map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setVenueFilter(f.key)}
                        className={`btn-sticker ${
                          venueFilter === f.key ? f.cls : "btn-gray"
                        } px-4 py-1.5 text-xs`}
                        style={
                          venueFilter !== f.key
                            ? { background: "#1a1a1a", color: "#9ca3af" }
                            : {}
                        }
                      >
                        {f.key}
                      </button>
                    ))}
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <IoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#ff6341] text-lg" />
                    <input
                      type="text"
                      value={venueSearch}
                      onChange={(e) => setVenueSearch(e.target.value)}
                      placeholder="Search venues..."
                      className="w-full pl-10 pr-4 py-3 nb-input"
                      style={nbInputStyle}
                    />
                  </div>

                  {/* Loading state */}
                  {venueLoading && (
                    <div className="text-center py-8">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 1,
                          ease: "linear",
                        }}
                        className="inline-block"
                      >
                        <IoRefresh className="text-[#ff6341] text-2xl" />
                      </motion.div>
                      <p className="text-[#9ca3af] mt-2 text-sm font-bold uppercase">
                        Loading...
                      </p>
                    </div>
                  )}

                  {/* Empty state */}
                  {!venueLoading && venues.length === 0 && (
                    <div className="game-card p-8 text-center">
                      <IoStorefront className="text-[#9ca3af] text-4xl mx-auto mb-3" />
                      <p className="text-[#9ca3af] font-bold uppercase text-sm">
                        No venues found
                      </p>
                    </div>
                  )}

                  {/* Venue cards */}
                  {!venueLoading &&
                    venues.map((v, idx) => (
                      <motion.div
                        key={v.id}
                        custom={idx}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="game-card p-5"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className="cursor-pointer group"
                            onClick={() => loadVenueDetail(v)}
                          >
                            <h4 className="text-white font-black uppercase text-base flex items-center gap-2 group-hover:text-[#ff6341] transition-colors">
                              {v.name}
                              <IoEye className="text-[#9ca3af] text-sm group-hover:text-[#ff6341]" />
                            </h4>
                            <p className="text-[#9ca3af] text-xs font-bold mt-0.5">
                              {v.ownerName} / {v.ownerPhone}
                            </p>
                            {v.slug && (
                              <p className="text-[#6b7280] text-[10px] font-bold mt-0.5">
                                /cafe/{v.slug}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {v.isActive &&
                              v.approvalStatus === "approved" && (
                                <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] animate-pulse" />
                              )}
                            <StatusBadge status={v.approvalStatus} />
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 mt-3 flex-wrap">
                          {v.approvalStatus === "pending" && (
                            <>
                              <button
                                onClick={() => venueAction(v.id, "approve")}
                                className="btn-sticker btn-green px-4 py-1.5 text-xs flex items-center gap-1.5"
                              >
                                <IoCheckmarkCircle /> Approve
                              </button>
                              <button
                                onClick={() => venueAction(v.id, "reject")}
                                className="btn-sticker btn-orange px-4 py-1.5 text-xs flex items-center gap-1.5"
                              >
                                <IoCloseCircle /> Reject
                              </button>
                            </>
                          )}
                          {v.approvalStatus === "approved" && v.isActive && (
                            <button
                              onClick={() => venueAction(v.id, "deactivate")}
                              className="btn-gray px-4 py-1.5 text-xs flex items-center gap-1.5"
                            >
                              <IoCloseCircle /> Deactivate
                            </button>
                          )}
                          {v.approvalStatus === "approved" && !v.isActive && (
                            <button
                              onClick={() => venueAction(v.id, "reactivate")}
                              className="btn-sticker btn-green px-4 py-1.5 text-xs flex items-center gap-1.5"
                            >
                              <IoCheckmarkCircle /> Reactivate
                            </button>
                          )}
                          {v.approvalStatus === "rejected" && (
                            <button
                              onClick={() => venueAction(v.id, "approve")}
                              className="btn-sticker btn-green px-4 py-1.5 text-xs flex items-center gap-1.5"
                            >
                              <IoCheckmarkCircle /> Approve
                            </button>
                          )}
                          <button
                            onClick={() => loadVenueDetail(v)}
                            className="btn-secondary px-4 py-1.5 text-xs flex items-center gap-1.5"
                          >
                            <IoEye /> View Detail
                          </button>
                        </div>

                        <p className="text-[#6b7280] text-[10px] font-bold mt-3 uppercase">
                          Created:{" "}
                          {new Date(v.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </p>
                      </motion.div>
                    ))}
                </motion.div>
              )}
            </AnimatePresence>
          </TabsContent>

          {/* ════════════════════════════════════════════════
             MATCHES TAB
             ════════════════════════════════════════════════ */}
          <TabsContent value="matches">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              {/* Belt-and-suspenders: even with loadMatches now extracting
                  the array correctly, a future API regression or a hot
                  network blip shouldn't be able to white-screen the page. */}
              {(() => {
                const safeMatches = Array.isArray(matches) ? matches : [];
                return (
                  <>
              {/* Header with refresh */}
              <div className="flex items-center justify-between">
                <h3
                  className="text-lg text-white"
                  style={{ fontFamily: "Bungee" }}
                >
                  All Matches ({safeMatches.length})
                </h3>
                <button
                  onClick={loadMatches}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  <IoRefresh className="text-lg" />
                </button>
              </div>

              {/* Match list */}
              {safeMatches.length === 0 && (
                <div className="game-card p-8 text-center">
                  <IoTrophy className="text-[#9ca3af] text-4xl mx-auto mb-3" />
                  <p className="text-[#9ca3af] font-bold uppercase text-sm">
                    No matches found
                  </p>
                </div>
              )}

              {safeMatches.map((m: any, idx: number) => (
                <motion.div
                  key={m.id}
                  custom={idx}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  className="game-card p-4 flex items-center justify-between"
                >
                  <div>
                    <span className="text-white text-sm font-black uppercase">
                      {m.team1Short || m.team1} vs {m.team2Short || m.team2}
                    </span>
                    <p className="text-[#6b7280] text-[10px] font-bold mt-0.5">
                      {m.startTime
                        ? new Date(m.startTime).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "No time"}
                    </p>
                  </div>
                  <MatchStatusBadge status={m.status} />
                </motion.div>
              ))}
                  </>
                );
              })()}

              {/* Sportsmonk Import Section */}
              <div
                className="mt-8 pt-6"
                style={{ borderTop: "2px solid #2a2a2a" }}
              >
                <h3
                  className="text-lg text-white mb-4"
                  style={{ fontFamily: "Bungee" }}
                >
                  Import from Sportsmonk
                </h3>
                <button
                  onClick={fetchFixtures}
                  disabled={fetchingFixtures}
                  className="btn-sticker btn-blue px-6 py-2.5 text-sm mb-5"
                >
                  {fetchingFixtures
                    ? "Fetching..."
                    : "Fetch Today's Fixtures"}
                </button>

                {fixtures.length > 0 && (
                  <div className="space-y-3">
                    {fixtures.map((f: any) => (
                      <div
                        key={f.id}
                        className="game-card p-4 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-white text-sm font-bold">
                            {f.localteam?.data?.name || f.localteam_id} vs{" "}
                            {f.visitorteam?.data?.name || f.visitorteam_id}
                          </span>
                          <p className="text-[#6b7280] text-[10px] font-bold mt-0.5">
                            {f.starting_at} / {f.status}
                          </p>
                        </div>
                        <button
                          onClick={() => importFixture(String(f.id))}
                          disabled={importing === String(f.id)}
                          className="btn-sticker btn-green px-4 py-1.5 text-xs"
                        >
                          {importing === String(f.id) ? "..." : "Import"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </TabsContent>

          {/* ════════════════════════════════════════════════
             SIM TAB — owner-portal sandbox match
             ════════════════════════════════════════════════ */}
          <TabsContent value="sim">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="game-card p-6 space-y-4">
                <div>
                  <h3 className="text-lg text-white" style={{ fontFamily: "Bungee" }}>
                    Simulation Match
                  </h3>
                  <p className="text-[#9ca3af] text-xs font-bold mt-1">
                    Hidden from regular users. ~5 min/over, restarts 10 min after each completion.
                  </p>
                </div>

                {simSnapshot ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="info-pill">STATUS</span>
                      <span
                        className="font-black uppercase text-sm"
                        style={{
                          color: simSnapshot.status === "running" ? "#22c55e"
                            : simSnapshot.status === "cooldown" ? "#ffd60a"
                            : "#9ca3af",
                        }}
                      >
                        {simSnapshot.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="card-blue p-3">
                        <div className="text-[#3b9eff]/70 uppercase font-bold mb-1">Inn 1 (SIM1)</div>
                        <div className="text-white font-black text-base">
                          {simSnapshot.innings1Score.runs}/{simSnapshot.innings1Score.wickets}
                          <span className="text-[#9ca3af] text-xs font-bold ml-2">
                            ({simSnapshot.innings1Score.overs} ov)
                          </span>
                        </div>
                      </div>
                      <div className="card-yellow p-3">
                        <div className="text-[#ffd60a]/70 uppercase font-bold mb-1">Inn 2 (SIM2)</div>
                        <div className="text-white font-black text-base">
                          {simSnapshot.innings2Score.runs}/{simSnapshot.innings2Score.wickets}
                          <span className="text-[#9ca3af] text-xs font-bold ml-2">
                            ({simSnapshot.innings2Score.overs} ov)
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[#9ca3af] text-xs font-bold">
                      Ball {simSnapshot.currentBallIndex} / {simSnapshot.totalBalls}
                      {simSnapshot.cooldownEndsAt && simSnapshot.status === "cooldown" ? (
                        <> · cooldown ends {new Date(simSnapshot.cooldownEndsAt).toLocaleTimeString("en-IN")}</>
                      ) : null}
                    </div>
                    {simSnapshot.matchId && (
                      <p className="text-[#6b7280] text-[10px] font-mono break-all">
                        matchId: {simSnapshot.matchId}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[#9ca3af] text-xs">Loading…</p>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => simAction("start")}
                    disabled={simBusy || simSnapshot?.status === "running"}
                    className="btn-sticker btn-green px-5 py-2 text-xs"
                  >
                    {simBusy ? "…" : "Start"}
                  </button>
                  <button
                    onClick={() => simAction("stop")}
                    disabled={simBusy || simSnapshot?.status === "idle"}
                    className="btn-sticker btn-orange px-5 py-2 text-xs"
                  >
                    {simBusy ? "…" : "Stop"}
                  </button>
                  <button
                    onClick={() => simAction("reset")}
                    disabled={simBusy}
                    className="btn-sticker btn-blue px-5 py-2 text-xs"
                  >
                    {simBusy ? "…" : "Reset & Replay"}
                  </button>
                  {simSnapshot?.matchId && (
                    <a
                      href={`/match/${simSnapshot.matchId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary px-5 py-2 text-xs"
                    >
                      Open as Player ↗
                    </a>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* ════════════════════════════════════════════════
             KONG TAB — admin-fired ad-hoc questions
             ════════════════════════════════════════════════ */}
          <TabsContent value="kong">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="game-card p-6 space-y-4">
                <div>
                  <h3 className="text-lg text-white" style={{ fontFamily: "Bungee" }}>
                    Fire The Kong Question
                  </h3>
                  <p className="text-[#9ca3af] text-xs font-bold mt-1">
                    Manually broadcast a custom question to a live or upcoming match. Resolve it later — points + leaderboards update automatically.
                  </p>
                </div>

                <div>
                  <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                    Match
                  </label>
                  <select
                    value={kongMatchId}
                    onChange={(e) => setKongMatchId(e.target.value)}
                    className="w-full px-3 py-3 nb-input"
                    style={nbInputStyle}
                  >
                    <option value="">Pick a match…</option>
                    {(Array.isArray(matches) ? matches : [])
                      .filter((m: any) => m.status !== "completed")
                      .map((m: any) => (
                        <option key={m.id} value={m.id}>
                          {m.team1Short || m.team1} vs {m.team2Short || m.team2} ({m.status})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                    Question
                  </label>
                  <input
                    type="text"
                    value={kongQuestion}
                    onChange={(e) => setKongQuestion(e.target.value)}
                    placeholder="e.g. Will the next over have a six?"
                    className="w-full px-4 py-3 nb-input"
                    style={nbInputStyle}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[#9ca3af] text-xs font-black uppercase tracking-wider">
                      Options ({kongOptions.length}/6)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => kongOptions.length < 6 && setKongOptions([...kongOptions, { label: "", points: "30" }])}
                        disabled={kongOptions.length >= 6}
                        className="btn-secondary px-2 py-1 text-[10px]"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {kongOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          type="text"
                          value={opt.label}
                          onChange={(e) => {
                            const next = [...kongOptions];
                            next[i] = { ...next[i], label: e.target.value };
                            setKongOptions(next);
                          }}
                          placeholder={`Option ${i + 1}`}
                          className="flex-1 px-3 py-2 nb-input text-sm"
                          style={nbInputStyle}
                        />
                        <input
                          type="number"
                          value={opt.points}
                          onChange={(e) => {
                            const next = [...kongOptions];
                            next[i] = { ...next[i], points: e.target.value };
                            setKongOptions(next);
                          }}
                          min={1}
                          max={500}
                          className="w-20 px-3 py-2 nb-input text-sm text-center"
                          style={nbInputStyle}
                        />
                        <button
                          type="button"
                          disabled={kongOptions.length <= 2}
                          onClick={() => setKongOptions(kongOptions.filter((_, idx) => idx !== i))}
                          className="btn-gray px-2 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={fireKong}
                  disabled={kongFiring || !kongMatchId}
                  className="btn-sticker btn-orange px-6 py-3 text-sm w-full"
                >
                  {kongFiring ? "Firing…" : "🦍 FIRE KONG QUESTION"}
                </button>
              </div>

              {/* Fired Kongs list */}
              {kongMatchId && (
                <div className="space-y-3">
                  <h3 className="text-base text-white" style={{ fontFamily: "Bungee" }}>
                    Fired Kong Questions ({kongList.length})
                  </h3>
                  {kongList.length === 0 && (
                    <div className="game-card p-4 text-center text-[#9ca3af] text-xs">
                      None yet for this match.
                    </div>
                  )}
                  {kongList.map((k) => (
                    <div key={k.id} className="game-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-white font-bold text-sm flex-1">{k.question}</p>
                        <span
                          className="text-[10px] font-black uppercase px-2 py-1 rounded"
                          style={{
                            background: k.status === "resolved" ? "rgba(34,197,94,0.18)"
                              : k.status === "open" ? "rgba(251,146,60,0.18)"
                              : "rgba(156,163,175,0.18)",
                            color: k.status === "resolved" ? "#22c55e"
                              : k.status === "open" ? "#fb923c"
                              : "#9ca3af",
                          }}
                        >
                          {k.status}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {k.options.map((opt) => {
                          const count = k.responses[opt.key] || 0;
                          const isCorrect = k.correctOption === opt.key;
                          const canResolve = k.status === "open";
                          return (
                            <div
                              key={opt.key}
                              className="flex items-center justify-between gap-2 px-3 py-2"
                              style={{
                                background: isCorrect ? "rgba(34,197,94,0.12)" : "#0d0d0d",
                                border: `1px solid ${isCorrect ? "#22c55e" : "#2a2a2a"}`,
                                borderRadius: 4,
                              }}
                            >
                              <div className="flex-1 text-xs">
                                <span className="text-white font-bold">{opt.label}</span>
                                <span className="text-[#9ca3af] ml-2">{opt.points}pts</span>
                              </div>
                              <span className="text-[#9ca3af] text-[11px]">{count} vote{count === 1 ? "" : "s"}</span>
                              {canResolve && (
                                <button
                                  onClick={() => resolveKong(k.id, opt.key)}
                                  disabled={kongResolvingId === k.id}
                                  className="btn-sticker btn-green px-3 py-1 text-[10px]"
                                >
                                  {kongResolvingId === k.id ? "…" : "Resolve"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="text-[#6b7280] text-[10px]">
                        {k.totalResponses} total response{k.totalResponses === 1 ? "" : "s"} · created {new Date(k.createdAt).toLocaleTimeString("en-IN")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </TabsContent>

          {/* ════════════════════════════════════════════════
             TOOLS TAB
             ════════════════════════════════════════════════ */}
          <TabsContent value="tools">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Trigger Score Poll */}
              <div className="game-card p-6">
                <h3
                  className="text-lg text-white mb-2"
                  style={{ fontFamily: "Bungee" }}
                >
                  Trigger Score Poll
                </h3>
                <p className="text-[#9ca3af] text-xs font-bold mb-4">
                  Manually trigger a Sportsmonk live score update.
                </p>
                <button
                  onClick={triggerPoll}
                  disabled={polling}
                  className="btn-secondary px-6 py-2.5 text-sm"
                >
                  {polling ? "Polling..." : "Trigger Poll"}
                </button>
                {pollResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4"
                  >
                    <div className="card-green p-3">
                      <p className="text-[#22c55e] text-xs font-bold">
                        {pollResult}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Resolve Prediction */}
              <div className="game-card p-6">
                <h3
                  className="text-lg text-white mb-2"
                  style={{ fontFamily: "Bungee" }}
                >
                  Resolve Prediction
                </h3>
                <p className="text-[#9ca3af] text-xs font-bold mb-4">
                  Manually resolve a prediction by ID.
                </p>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                      Prediction ID
                    </label>
                    <input
                      type="text"
                      value={resolvePredId}
                      onChange={(e) => setResolvePredId(e.target.value)}
                      placeholder="Enter prediction ID"
                      className="w-full px-4 py-3 nb-input"
                      style={nbInputStyle}
                    />
                  </div>
                  <div>
                    <label className="block text-[#9ca3af] mb-1.5 text-xs font-black uppercase tracking-wider">
                      Correct Option
                    </label>
                    <input
                      type="text"
                      value={resolveOption}
                      onChange={(e) => setResolveOption(e.target.value)}
                      placeholder="e.g. option_a"
                      className="w-full px-4 py-3 nb-input"
                      style={nbInputStyle}
                    />
                  </div>
                </div>
                <button
                  onClick={handleResolve}
                  disabled={!resolvePredId || !resolveOption}
                  className="btn-sticker btn-orange px-6 py-2.5 text-sm"
                >
                  Resolve
                </button>
                {resolveResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4"
                  >
                    <div
                      className={
                        resolveResult.success ? "card-green p-3" : "card-orange p-3"
                      }
                    >
                      <p
                        className={`text-xs font-bold ${
                          resolveResult.success
                            ? "text-[#22c55e]"
                            : "text-[#ff6341]"
                        }`}
                      >
                        {resolveResult.message}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
