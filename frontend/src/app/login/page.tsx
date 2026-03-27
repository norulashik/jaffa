"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { IoCall } from "react-icons/io5";
import { User, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";
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
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendTimer, setResendTimer] = useState(45);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [verifiedCode, setVerifiedCode] = useState("");
  const [venueName, setVenueName] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

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
  }, []);

  const handleSendOTP = async () => {
    if (!phone || phone.length < 10) {
      setError("Please enter a valid 10-digit number");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.sendOTP(phone);
      setOtpSent(true);
      let t = 45;
      setResendTimer(t);
      const interval = setInterval(() => {
        t--;
        setResendTimer(t);
        if (t <= 0) clearInterval(interval);
      }, 1000);
    } catch (err: any) {
      setError(err.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (value.length > 1) value = value[value.length - 1];
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      if (value && index < 5) {
        otpRefs.current[index + 1]?.focus();
      }

      // Auto-verify when all 6 digits entered
      if (newOtp.every((d) => d !== "") && newOtp.join("").length === 6) {
        verifyOTP(newOtp.join(""));
      }
    },
    [otp]
  );

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const verifyOTP = async (code: string, name?: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.verifyOTP(phone, code, name);
      if ((result as any).needsDisplayName) {
        setNeedsDisplayName(true);
        setVerifiedCode(code);
        return;
      }
      if (result.token) {
        localStorage.setItem("jaffa_token", result.token);
        localStorage.setItem("jaffa_user", JSON.stringify(result.user));
        router.push(cafeUrl("/lobby"));
      }
    } catch (err: any) {
      setError(err.message || "Invalid OTP");
      setOtp(["", "", "", "", "", ""]);
      setNeedsDisplayName(false);
      setVerifiedCode("");
      setOtpSent(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDisplayNameSubmit = async () => {
    if (!displayName.trim()) {
      setError("Please enter a display name");
      return;
    }
    await verifyOTP(verifiedCode, displayName.trim());
  };

  const handleResend = async () => {
    if (resendTimer > 0) return;
    await handleSendOTP();
  };

  // Determine current step label
  const stepLabel = needsDisplayName
    ? "Step 3 of 3 — Choose Name"
    : otpSent
    ? "Step 2 of 3 — Verify Code"
    : "Step 1 of 3 — Phone Number";

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center px-4 py-8">
      {/* Orange accent stripe at top */}
      <div className="fixed top-0 left-0 w-full h-1 bg-[#ff6341] z-50" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-sm"
      >
        {/* Main card */}
        <div
          className="bg-[#1a1a1a] p-6 sm:p-8"
          style={{
            border: "3px solid #ff6341",
            borderRadius: "4px",
            boxShadow: "6px 6px 0 0 #ff6341",
          }}
        >
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/jaffa-logo.png"
              alt="JAFFA"
              width={180}
              height={70}
              className="w-[180px] h-auto"
              priority
            />
          </div>

          {/* Step indicator pill */}
          <div className="flex justify-center mb-6">
            <div
              className="info-pill text-white/60 flex items-center gap-2"
            >
              <ShieldCheck size={14} className="text-[#ff6341]" />
              <span>{stepLabel}</span>
            </div>
          </div>

          {/* Venue name */}
          {venueName && (
            <div className="flex justify-center mb-5">
              <div className="info-pill text-[#ff6341] flex items-center gap-2">
                <span className="w-2 h-2 bg-[#ff6341] rounded-none inline-block" style={{ borderRadius: "1px" }} />
                {venueName}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* Step 1: Phone */}
            {!otpSent && !needsDisplayName && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                <label className="text-white/60 block text-xs tracking-widest">
                  MOBILE NUMBER
                </label>
                <div className="relative">
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

                {error && (
                  <p className="text-[#ff6341] text-xs font-bold uppercase">{error}</p>
                )}

                <button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="btn-sticker btn-orange w-full py-4 flex items-center justify-center gap-2"
                  style={BUNGEE}
                >
                  {loading ? "SENDING..." : "SEND OTP"}
                  <ArrowRight size={18} />
                </button>
              </motion.div>
            )}

            {/* Step 2: OTP Verification */}
            {otpSent && !needsDisplayName && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                <label className="text-white/60 block text-xs tracking-widest">
                  ENTER 6-DIGIT CODE
                </label>

                <div className="grid grid-cols-6 gap-2">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      className="nb-input w-full aspect-square text-center text-xl"
                      style={{ letterSpacing: 0 }}
                      maxLength={1}
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    />
                  ))}
                </div>

                {/* Timer + Resend */}
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-xs">
                    {resendTimer > 0
                      ? `Resend in 0:${resendTimer.toString().padStart(2, "0")}`
                      : ""}
                  </span>
                  <button
                    onClick={handleResend}
                    className={`text-xs uppercase tracking-wider font-bold ${
                      resendTimer > 0
                        ? "text-white/30 cursor-not-allowed"
                        : "text-[#ff6341] hover:underline"
                    }`}
                    disabled={resendTimer > 0}
                  >
                    {resendTimer <= 0 ? "Resend OTP" : ""}
                  </button>
                </div>

                {error && (
                  <p className="text-[#ff6341] text-xs font-bold uppercase">{error}</p>
                )}

                <button
                  onClick={() => verifyOTP(otp.join(""))}
                  disabled={loading || otp.some((d) => !d)}
                  className="btn-sticker btn-orange w-full py-4 flex items-center justify-center gap-2"
                  style={BUNGEE}
                >
                  {loading ? "VERIFYING..." : "VERIFY"}
                  <KeyRound size={18} />
                </button>

                {/* Change number link */}
                <button
                  onClick={() => {
                    setOtpSent(false);
                    setOtp(["", "", "", "", "", ""]);
                    setError("");
                  }}
                  className="text-white/40 text-xs uppercase tracking-wider hover:text-[#ff6341] transition-colors w-full text-center"
                >
                  Change Number
                </button>
              </motion.div>
            )}

            {/* Step 3: Display Name */}
            {needsDisplayName && (
              <motion.div
                key="name"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.3 }}
                className="space-y-5"
              >
                <label className="text-white/60 block text-xs tracking-widest">
                  CHOOSE YOUR ARENA NAME
                </label>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[#ff6341]">
                    <User size={18} />
                  </div>
                  <input
                    className="nb-input w-full pl-10 pr-4 py-4 text-lg"
                    type="text"
                    placeholder="Enter display name"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDisplayNameSubmit();
                    }}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-[#ff6341] text-xs font-bold uppercase">{error}</p>
                )}

                <button
                  onClick={handleDisplayNameSubmit}
                  disabled={loading || !displayName.trim()}
                  className="btn-sticker btn-orange w-full py-4 flex items-center justify-center gap-2"
                  style={BUNGEE}
                >
                  {loading ? "JOINING..." : "START PLAYING"}
                  <ArrowRight size={18} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
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
