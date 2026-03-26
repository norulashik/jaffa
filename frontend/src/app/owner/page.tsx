"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  IoStatsChart, IoStorefront, IoSettings, IoTrophy,
  IoCheckmarkCircle, IoCloseCircle, IoPeople, IoRefresh,
  IoArrowBack, IoEye, IoSearch,
} from "react-icons/io5";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

type Tab = "dashboard" | "venues" | "venue-detail" | "matches" | "tools";

export default function OwnerPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Login
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");

  // Dashboard
  const [stats, setStats] = useState<any>(null);

  // Venues
  const [venues, setVenues] = useState<any[]>([]);
  const [venueFilter, setVenueFilter] = useState("all");
  const [venueSearch, setVenueSearch] = useState("");
  const [venueLoading, setVenueLoading] = useState(false);

  // Venue Detail
  const [selectedVenue, setSelectedVenue] = useState<any>(null);
  const [venueDetail, setVenueDetail] = useState<any>(null);
  const [venueMatches, setVenueMatches] = useState<any[]>([]);
  const [venueLeaderboard, setVenueLeaderboard] = useState<any[]>([]);
  const [venueRewards, setVenueRewards] = useState<any[]>([]);

  // Matches
  const [matches, setMatches] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [importing, setImporting] = useState<string | null>(null);
  const [fetchingFixtures, setFetchingFixtures] = useState(false);

  // Tools
  const [pollResult, setPollResult] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [resolvePredId, setResolvePredId] = useState("");
  const [resolveOption, setResolveOption] = useState("");
  const [resolveResult, setResolveResult] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem("jaffa_owner_token");
    if (saved) {
      setToken(saved);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn && token) {
      loadStats();
      loadVenues();
      loadMatches();
      const interval = setInterval(() => {
        loadStats();
        loadVenues();
        loadMatches();
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, token]);

  const ownerFetch = async (path: string, options: RequestInit = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    return res;
  };

  // ── Auth ──────────────────────────────────────────────────

  const handleLogin = async () => {
    setLoginError("");
    try {
      const res = await fetch(`${API_URL}/owner/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setToken(data.token);
      localStorage.setItem("jaffa_owner_token", data.token);
      setIsLoggedIn(true);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  // ── Data Loaders ──────────────────────────────────────────

  const loadStats = async () => {
    try {
      const res = await ownerFetch("/owner/stats");
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  const loadVenues = async () => {
    setVenueLoading(true);
    try {
      const params = new URLSearchParams();
      if (venueFilter !== "all") params.set("status", venueFilter);
      if (venueSearch) params.set("search", venueSearch);
      const res = await ownerFetch(`/owner/venues?${params}`);
      if (res.ok) setVenues(await res.json());
    } catch {}
    setVenueLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn && token) loadVenues();
  }, [venueFilter, venueSearch]);

  const loadMatches = async () => {
    try {
      const res = await ownerFetch("/owner/matches");
      if (res.ok) setMatches(await res.json());
    } catch {}
  };

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
      if (lbRes.ok) setVenueLeaderboard(await lbRes.json());
      if (rewardsRes.ok) setVenueRewards(await rewardsRes.json());
    } catch {}
  };

  // ── Actions ───────────────────────────────────────────────

  const venueAction = async (venueId: string, action: string) => {
    try {
      await ownerFetch(`/owner/venues/${venueId}/${action}`, { method: "PATCH" });
      loadVenues();
      loadStats();
    } catch {}
  };

  const fetchFixtures = async () => {
    setFetchingFixtures(true);
    try {
      const res = await ownerFetch("/owner/cricket/fixtures");
      if (res.ok) setFixtures(await res.json());
    } catch {}
    setFetchingFixtures(false);
  };

  const importFixture = async (fixtureId: string) => {
    setImporting(fixtureId);
    try {
      await ownerFetch(`/owner/cricket/import/${fixtureId}`, { method: "POST" });
      loadMatches();
    } catch {}
    setImporting(null);
  };

  const triggerPoll = async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await ownerFetch("/owner/cricket/poll", { method: "POST" });
      const data = await res.json();
      setPollResult(data.message || "Done");
    } catch (err: any) {
      setPollResult("Failed: " + err.message);
    }
    setPolling(false);
  };

  const handleResolve = async () => {
    setResolveResult(null);
    try {
      const res = await ownerFetch(`/owner/predictions/${resolvePredId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ correctOption: resolveOption }),
      });
      const data = await res.json();
      setResolveResult({ success: res.ok, message: data.message || data.error });
      if (res.ok) { setResolvePredId(""); setResolveOption(""); }
    } catch (err: any) {
      setResolveResult({ success: false, message: err.message });
    }
  };

  // ── Login Screen ──────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-black text-primary-container text-center mb-2">JAFFA</h1>
          <p className="text-on-surface-variant text-center text-sm mb-8">Owner Portal</p>
          <input
            type="text"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            placeholder="Username"
            className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-3 outline-none focus:ring-2 focus:ring-primary-container"
          />
          <input
            type="password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            placeholder="Password"
            className="w-full bg-surface-container-high text-on-surface px-4 py-3 rounded-xl mb-4 outline-none focus:ring-2 focus:ring-primary-container"
          />
          {loginError && <p className="text-error text-sm mb-4">{loginError}</p>}
          <button onClick={handleLogin} className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-bold py-3 rounded-xl transition-colors">
            Login
          </button>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-surface-container-low border-b border-white/5 px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-container">JAFFA Owner</h1>
            <p className="text-sm text-on-surface-variant">Super Admin</p>
          </div>
          <button
            onClick={() => { localStorage.removeItem("jaffa_owner_token"); setIsLoggedIn(false); }}
            className="text-sm text-outline hover:text-on-surface"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-surface-container-low border-b border-white/5 overflow-x-auto">
        {[
          { key: "dashboard", icon: <IoStatsChart />, label: "Dashboard" },
          { key: "venues", icon: <IoStorefront />, label: "Venues" },
          { key: "matches", icon: <IoTrophy />, label: "Matches" },
          { key: "tools", icon: <IoSettings />, label: "Tools" },
        ].filter((t) => t.key !== "venue-detail").map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as Tab)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.key || (activeTab === "venue-detail" && tab.key === "venues")
                ? "text-primary-container border-b-2 border-primary-container"
                : "text-outline"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4 max-w-3xl mx-auto">
        {/* ── Dashboard Tab ─────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div className="space-y-4">
            {stats && (
              <>
                {stats.pendingVenues > 0 && (
                  <motion.div
                    initial={{ y: -10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <IoStorefront className="text-amber-400 text-xl" />
                      <span className="text-amber-300 font-medium text-sm">{stats.pendingVenues} venue(s) awaiting approval</span>
                    </div>
                    <button
                      onClick={() => { setVenueFilter("pending"); setActiveTab("venues"); }}
                      className="text-xs bg-amber-500 text-black font-bold font-bold px-3 py-1.5 rounded-lg"
                    >
                      Review
                    </button>
                  </motion.div>
                )}

                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Total Venues" value={stats.totalVenues} />
                  <StatCard label="Active Venues" value={stats.activeVenues} />
                  <StatCard label="Pending" value={stats.pendingVenues} color="amber" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Total Players" value={stats.totalPlayers} />
                  <StatCard label="Total Matches" value={stats.totalMatches} />
                  <StatCard label="Predictions" value={stats.totalPredictions} />
                </div>

                {stats.liveMatches > 0 && (
                  <div className="bg-surface-container-low rounded-xl p-4 border border-green-500/30">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                      <span className="text-green-400 font-medium text-sm">{stats.liveMatches} live match(es)</span>
                    </div>
                  </div>
                )}
              </>
            )}
            {!stats && <p className="text-on-surface-variant text-center py-8">Loading stats...</p>}
          </div>
        )}

        {/* ── Venues Tab ────────────────────────────────── */}
        {activeTab === "venues" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-2 flex-wrap">
              {["all", "pending", "approved", "rejected"].map((f) => (
                <button
                  key={f}
                  onClick={() => setVenueFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase ${
                    venueFilter === f
                      ? "bg-orange-500 text-on-surface"
                      : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <IoSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
              <input
                type="text"
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="Search venues..."
                className="w-full bg-surface-container-high text-on-surface pl-10 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-primary-container text-sm"
              />
            </div>

            {/* Venue List */}
            {venueLoading && <p className="text-on-surface-variant text-center py-4">Loading...</p>}
            {!venueLoading && venues.length === 0 && (
              <p className="text-on-surface-variant text-center py-8">No venues found</p>
            )}
            {venues.map((v) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-container-low rounded-xl p-4 border border-white/5"
              >
                <div className="flex items-start justify-between mb-2">
                  <div
                    className="cursor-pointer hover:text-on-surface transition-colors"
                    onClick={() => loadVenueDetail(v)}
                  >
                    <h4 className="text-on-surface font-semibold flex items-center gap-2">
                      {v.name}
                      <IoEye className="text-outline text-sm" />
                    </h4>
                    <p className="text-on-surface-variant text-xs">{v.ownerName} / {v.ownerPhone}</p>
                    {v.slug && <p className="text-outline text-[10px]">/cafe/{v.slug}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {v.isActive && v.approvalStatus === "approved" && (
                      <span className="w-2 h-2 rounded-full bg-green-400"></span>
                    )}
                    <StatusBadge status={v.approvalStatus} />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  {v.approvalStatus === "pending" && (
                    <>
                      <button onClick={() => venueAction(v.id, "approve")} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                        <IoCheckmarkCircle /> Approve
                      </button>
                      <button onClick={() => venueAction(v.id, "reject")} className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                        <IoCloseCircle /> Reject
                      </button>
                    </>
                  )}
                  {v.approvalStatus === "approved" && v.isActive && (
                    <button onClick={() => venueAction(v.id, "deactivate")} className="text-xs border border-red-500/50 text-error hover:bg-red-500/10 font-bold px-3 py-1.5 rounded-lg transition-colors">
                      Deactivate
                    </button>
                  )}
                  {v.approvalStatus === "approved" && !v.isActive && (
                    <button onClick={() => venueAction(v.id, "reactivate")} className="text-xs border border-green-500/50 text-green-400 hover:bg-green-500/10 font-bold px-3 py-1.5 rounded-lg transition-colors">
                      Reactivate
                    </button>
                  )}
                  {v.approvalStatus === "rejected" && (
                    <button onClick={() => venueAction(v.id, "approve")} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                      <IoCheckmarkCircle /> Approve
                    </button>
                  )}
                </div>
                <p className="text-outline-variant text-[10px] mt-2">Created: {new Date(v.createdAt).toLocaleDateString()}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Venue Detail Tab ──────────────────────────── */}
        {activeTab === "venue-detail" && selectedVenue && (
          <div className="space-y-4">
            <button
              onClick={() => setActiveTab("venues")}
              className="flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-sm mb-2"
            >
              <IoArrowBack /> Back to Venues
            </button>

            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h3 className="text-on-surface font-bold text-lg">{selectedVenue.name}</h3>
              <p className="text-on-surface-variant text-sm">{selectedVenue.ownerName} / {selectedVenue.ownerPhone}</p>
              <div className="flex gap-2 mt-2">
                <StatusBadge status={selectedVenue.approvalStatus} />
                {selectedVenue.isActive ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Active</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-error">Inactive</span>
                )}
              </div>
            </div>

            {venueDetail && (
              <div className="grid grid-cols-4 gap-3">
                <StatCard label="Players" value={venueDetail.totalPlayers} />
                <StatCard label="Matches" value={venueDetail.totalMatches} />
                <StatCard label="Rewards" value={venueDetail.totalRewards} />
                <StatCard label="Redeemed" value={venueDetail.redeemedRewards} />
              </div>
            )}

            {/* Matches at this venue */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h4 className="text-on-surface font-semibold mb-3">Matches ({venueMatches.length})</h4>
              {venueMatches.length === 0 && <p className="text-on-surface-variant text-xs">No matches yet</p>}
              <div className="space-y-2">
                {venueMatches.map((m: any) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-on-surface">{m.team1Short || m.team1} vs {m.team2Short || m.team2}</span>
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                        m.status === "live" ? "bg-green-500/20 text-green-400" :
                        m.status === "completed" ? "bg-surface-container-highest text-on-surface-variant" :
                        "bg-blue-500/20 text-blue-400"
                      }`}>{m.status}</span>
                    </div>
                    <span className="text-on-surface-variant text-xs flex items-center gap-1"><IoPeople /> {m.playerCount}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Leaderboard */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h4 className="text-on-surface font-semibold mb-3">Top Players</h4>
              {venueLeaderboard.length === 0 && <p className="text-on-surface-variant text-xs">No players yet</p>}
              <div className="space-y-2">
                {venueLeaderboard.slice(0, 20).map((p: any) => (
                  <div key={p.rank} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-outline w-5">#{p.rank}</span>
                      <span className="text-on-surface">{p.displayName}</span>
                    </div>
                    <span className="text-primary-container font-medium">{p.totalPoints} pts</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rewards */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h4 className="text-on-surface font-semibold mb-3">Rewards ({venueRewards.length})</h4>
              {venueRewards.length === 0 && <p className="text-on-surface-variant text-xs">No rewards yet</p>}
              <div className="space-y-2">
                {venueRewards.slice(0, 20).map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-on-surface">{r.user?.displayName || "Player"}</span>
                      <span className="text-on-surface-variant text-xs ml-2">{r.rewardText}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      r.status === "active" ? "bg-green-500/20 text-green-400" :
                      r.status === "redeemed" ? "bg-blue-500/20 text-blue-400" :
                      "bg-red-500/20 text-error"
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Matches Tab ───────────────────────────────── */}
        {activeTab === "matches" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-on-surface font-semibold">All Matches ({matches.length})</h3>
              <button onClick={loadMatches} className="text-on-surface-variant hover:text-on-surface"><IoRefresh /></button>
            </div>

            {matches.map((m: any) => (
              <div key={m.id} className="bg-surface-container-low rounded-xl p-3 border border-white/5 flex items-center justify-between">
                <div>
                  <span className="text-on-surface text-sm font-medium">{m.team1Short || m.team1} vs {m.team2Short || m.team2}</span>
                  <p className="text-outline text-[10px]">
                    {m.startTime ? new Date(m.startTime).toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "No time"}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  m.status === "live" ? "bg-green-500/20 text-green-400" :
                  m.status === "completed" ? "bg-surface-container-highest text-on-surface-variant" :
                  "bg-blue-500/20 text-blue-400"
                }`}>{m.status}</span>
              </div>
            ))}

            {/* Sportsmonk Import */}
            <div className="border-t border-white/5 pt-4 mt-6">
              <h3 className="text-on-surface font-semibold mb-3">Import from Sportsmonk</h3>
              <button
                onClick={fetchFixtures}
                disabled={fetchingFixtures}
                className="bg-primary-container hover:bg-primary-fixed-dim disabled:bg-surface-container-highest text-on-primary-container font-bold text-sm px-4 py-2 rounded-xl transition-colors mb-4"
              >
                {fetchingFixtures ? "Fetching..." : "Fetch Today's Fixtures"}
              </button>

              {fixtures.length > 0 && (
                <div className="space-y-2">
                  {fixtures.map((f: any) => (
                    <div key={f.id} className="bg-surface-container-high rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <span className="text-on-surface text-sm">
                          {f.localteam?.data?.name || f.localteam_id} vs {f.visitorteam?.data?.name || f.visitorteam_id}
                        </span>
                        <p className="text-outline text-[10px]">{f.starting_at} / {f.status}</p>
                      </div>
                      <button
                        onClick={() => importFixture(String(f.id))}
                        disabled={importing === String(f.id)}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:bg-surface-container-highest text-on-surface font-bold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {importing === String(f.id) ? "..." : "Import"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tools Tab ─────────────────────────────────── */}
        {activeTab === "tools" && (
          <div className="space-y-6">
            {/* Poll */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h3 className="text-on-surface font-semibold mb-2">Trigger Score Poll</h3>
              <p className="text-on-surface-variant text-xs mb-3">Manually trigger a Sportsmonk live score update.</p>
              <button
                onClick={triggerPoll}
                disabled={polling}
                className="bg-primary-container hover:bg-primary-fixed-dim disabled:bg-surface-container-highest text-on-primary-container font-bold text-sm px-4 py-2 rounded-xl transition-colors"
              >
                {polling ? "Polling..." : "Trigger Poll"}
              </button>
              {pollResult && (
                <p className="text-green-400 text-xs mt-2">{pollResult}</p>
              )}
            </div>

            {/* Manual Resolve */}
            <div className="bg-surface-container-low rounded-xl p-4 border border-white/5">
              <h3 className="text-on-surface font-semibold mb-2">Resolve Prediction</h3>
              <p className="text-on-surface-variant text-xs mb-3">Manually resolve a prediction by ID.</p>
              <input
                type="text"
                value={resolvePredId}
                onChange={(e) => setResolvePredId(e.target.value)}
                placeholder="Prediction ID"
                className="w-full bg-surface-container-high text-on-surface px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary-container text-sm mb-2"
              />
              <input
                type="text"
                value={resolveOption}
                onChange={(e) => setResolveOption(e.target.value)}
                placeholder="Correct option (e.g. option_a)"
                className="w-full bg-surface-container-high text-on-surface px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-primary-container text-sm mb-3"
              />
              <button
                onClick={handleResolve}
                disabled={!resolvePredId || !resolveOption}
                className="bg-primary-container hover:bg-primary-fixed-dim disabled:bg-surface-container-highest text-on-primary-container font-bold text-sm px-4 py-2 rounded-xl transition-colors"
              >
                Resolve
              </button>
              {resolveResult && (
                <p className={`text-xs mt-2 ${resolveResult.success ? "text-green-400" : "text-error"}`}>
                  {resolveResult.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-white/5 text-center">
      <div className={`text-2xl font-bold ${color === "amber" ? "text-amber-400" : "text-on-surface"}`}>{value}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400",
    approved: "bg-green-500/20 text-green-400",
    rejected: "bg-red-500/20 text-error",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${styles[status] || "bg-surface-container-highest text-on-surface-variant"}`}>
      {status}
    </span>
  );
}
