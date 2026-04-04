"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IoCall } from "react-icons/io5";
import { User, ArrowRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { cafeUrl } from "@/lib/navigation";

const BUNGEE: React.CSSProperties = {
  fontFamily: "'Bungee', 'Impact', cursive",
  textTransform: "uppercase" as const,
};

export default function LoginOTP() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [venueName, setVenueName] = useState("");

  useEffect(() => {
    const isCafeRoute = window.location.pathname.startsWith("/cafe/");
    if (!isCafeRoute) {
      router.replace("/");
      return;
    }
    const venueId = localStorage.getItem("jaffa_venue_id");
    if (venueId) {
      api.getVenue(venueId).then((v) => setVenueName(v.name)).catch(() => {});
    }
  }, [router]);

  const handleLogin = async () => {
    if (!phone || phone.length < 10) {
      setError("Please enter a valid 10-digit number");
      return;
    }
    if (!displayName.trim()) {
      setError("Please enter a nickname");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await api.loginWithPhone(phone, displayName.trim());
      localStorage.setItem("jaffa_token", result.token);
      localStorage.setItem("jaffa_user", JSON.stringify(result.user));
      router.push(cafeUrl("/lobby"));
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-8">
      <div className="fixed top-0 left-0 w-full h-1 bg-[#ff6341] z-50" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        <div
          className="bg-[#1a1a1a] p-6 sm:p-8"
          style={{
            border: "3px solid #ff6341",
            borderRadius: "4px",
            boxShadow: "6px 6px 0 0 #ff6341",
          }}
        >
          <div className="flex justify-center mb-6">
            <Image
              src="/jaffa-logo.png"
              alt="JAFFA"
              width={180}
              height={70}
              className="w-[180px] h-auto"
              style={{ height: "auto" }}
              priority
            />
          </div>

          <div className="flex justify-center mb-6">
            <div className="info-pill text-white/60 flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#ff6341]" />
              <span>Enter Mobile Number and Nickname</span>
            </div>
          </div>

          {venueName && (
            <div className="flex justify-center mb-5">
              <div className="info-pill text-[#ff6341] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#ff6341] rounded-none inline-block" style={{ borderRadius: "1px" }} />
                {venueName}
              </div>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="text-white/60 block text-xs tracking-widest">
                MOBILE NUMBER
              </label>
              <div className="relative mt-2">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[#ff6341]">
                  <IoCall size={18} />
                  <span className="ml-2 text-white/50 text-sm font-bold">+91</span>
                </div>
                <input
                  className="nb-input w-full pl-16 pr-4 py-4 text-lg tracking-widest"
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    setError("");
                  }}
                  maxLength={10}
                />
              </div>
            </div>

            <div>
              <label className="text-white/60 block text-xs tracking-widest">
                NICKNAME
              </label>
              <div className="relative mt-2">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[#ff6341]">
                  <User size={18} />
                </div>
                <input
                  className="nb-input w-full pl-10 pr-4 py-4 text-lg"
                  type="text"
                  placeholder="Enter nickname"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                />
              </div>
            </div>

            {error && (
              <p className="text-[#ff6341] text-xs font-bold uppercase">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="btn-sticker btn-orange w-full py-4 flex items-center justify-center gap-2"
              style={BUNGEE}
            >
              {loading ? "JOINING..." : "START PLAYING"}
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-white/30 text-xs">
            By continuing, you agree to Jaffa&apos;s{" "}
            <span className="underline text-white/50">Terms of Play</span> and{" "}
            <span className="underline text-white/50">Privacy Rules</span>.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
