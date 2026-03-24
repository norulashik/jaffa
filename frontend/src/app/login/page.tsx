"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import MaterialIcon from "@/components/MaterialIcon";
import { api } from "@/lib/api";

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
      // Start resend timer
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
        router.push("/lobby");
      }
    } catch (err: any) {
      setError(err.message || "Invalid OTP");
      // Reset fully so user can re-enter OTP
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

  return (
    <div className="bg-surface-container-lowest text-on-surface font-body stadium-gradient min-h-screen flex flex-col">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 w-full flex justify-between items-center px-6 py-4 max-w-none bg-slate-900/40 backdrop-blur-xl z-50">
        <div className="flex items-center gap-2">
          <MaterialIcon icon="sports_cricket" className="text-[#00FFAB]" />
          <span className="font-headline font-black italic text-[#00FFAB] tracking-widest text-2xl uppercase">
            JAFFA
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-outline-variant/20">
          <MaterialIcon icon="help" className="text-on-surface-variant text-sm" />
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center px-6 pt-24 pb-12">
        <div className="w-full max-w-md space-y-10">
          {/* Branding/Hero Section */}
          <div className="text-left space-y-2">
            {venueName && (
              <div className="flex items-center gap-2 mb-2">
                <MaterialIcon icon="store" className="text-secondary-container text-sm" />
                <span className="font-label text-xs font-bold uppercase tracking-widest text-secondary-container">{venueName}</span>
              </div>
            )}
            <h1 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface">
              The Arena <br />
              <span className="text-primary-container">Awaits.</span>
            </h1>
            <p className="font-body text-on-surface-variant text-sm max-w-[280px]">
              Enter your mobile number to join the most intense cricket prediction circle.
            </p>
          </div>

          {/* Login Form */}
          <div className="space-y-8">
            {/* Phone Input Field */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-on-surface-variant group-focus-within:text-primary-container transition-colors">
                <span className="font-label font-bold text-sm">+91</span>
              </div>
              <input
                className="block w-full pl-14 pr-4 py-5 bg-surface-container-low border-0 rounded-xl focus:ring-2 focus:ring-primary-container/30 font-headline font-bold text-lg tracking-[0.2em] placeholder:text-transparent peer text-on-surface"
                id="phone"
                placeholder="Phone Number"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setError("");
                }}
                maxLength={10}
              />
              <label
                className="absolute text-on-surface-variant duration-300 transform -translate-y-4 scale-75 top-2 z-10 origin-[0] bg-surface-container-low px-2 peer-focus:px-2 peer-focus:text-primary-container peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:top-1/2 peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4 left-12 font-label text-xs uppercase tracking-widest font-bold pointer-events-none"
                htmlFor="phone"
              >
                Mobile Number
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-error text-sm font-label">{error}</p>
            )}

            {/* Action Button */}
            <button
              onClick={handleSendOTP}
              disabled={loading}
              className={`relative w-full overflow-hidden bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-headline font-extrabold text-sm uppercase tracking-widest py-5 rounded-xl transition-all duration-300 active:scale-95 neon-glow group disabled:opacity-50 ${needsDisplayName ? "hidden" : ""}`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}
                <MaterialIcon icon="arrow_forward" className="text-lg" />
              </span>
              {/* Shimmer Layer */}
              <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>

            {/* OTP Entry Section */}
            {otpSent && !needsDisplayName && (
              <div className="space-y-6 pt-4">
                <div className="flex items-center justify-between px-1">
                  <label className="font-label text-[10px] font-extrabold uppercase tracking-[0.2em] text-on-surface-variant">
                    Verify Secure Code
                  </label>
                  <button
                    onClick={handleResend}
                    className={`text-[10px] font-extrabold uppercase tracking-widest transition-colors ${
                      resendTimer > 0
                        ? "text-on-surface-variant cursor-not-allowed"
                        : "text-secondary-container hover:text-primary-container"
                    }`}
                  >
                    {resendTimer > 0
                      ? `Resend in 0:${resendTimer.toString().padStart(2, "0")}`
                      : "Resend OTP"}
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpRefs.current[index] = el; }}
                      className="w-full aspect-square text-center bg-surface-container-high/40 backdrop-blur-md border-0 rounded-lg font-headline font-bold text-xl text-primary-container focus:ring-2 focus:ring-primary-container/40 transition-all shadow-inner"
                      maxLength={1}
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Display Name Section (for new users) */}
            {needsDisplayName && (
              <div className="space-y-6 pt-4">
                <div className="px-1">
                  <label className="font-label text-[10px] font-extrabold uppercase tracking-[0.2em] text-on-surface-variant">
                    Choose Your Arena Name
                  </label>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-on-surface-variant group-focus-within:text-primary-container transition-colors">
                    <MaterialIcon icon="person" className="text-lg" />
                  </div>
                  <input
                    className="block w-full pl-12 pr-4 py-5 bg-surface-container-low border-0 rounded-xl focus:ring-2 focus:ring-primary-container/30 font-headline font-bold text-lg tracking-wide placeholder:text-on-surface-variant/40 text-on-surface"
                    placeholder="Enter display name"
                    type="text"
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
                <button
                  onClick={handleDisplayNameSubmit}
                  disabled={loading || !displayName.trim()}
                  className="relative w-full overflow-hidden bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-headline font-extrabold text-sm uppercase tracking-widest py-5 rounded-xl transition-all duration-300 active:scale-95 neon-glow group disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? "Joining..." : "Enter Arena"}
                    <MaterialIcon icon="double_arrow" className="text-lg" />
                  </span>
                  <div className="absolute inset-0 shimmer opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              </div>
            )}
          </div>

          {/* Footer Messaging */}
          <div className="text-center space-y-6">
            <p className="font-body text-xs text-on-surface-variant opacity-60">
              By continuing, you agree to Jaffa&apos;s{" "}
              <span className="underline text-on-surface">Terms of Play</span> and{" "}
              <span className="underline text-on-surface">Privacy Rules</span>.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest pt-4">
              <span className="w-8 h-[1px] bg-outline-variant/30"></span>
              <span>Success → smooth transition</span>
              <span className="w-8 h-[1px] bg-outline-variant/30"></span>
            </div>
          </div>
        </div>
      </main>

      {/* Visual Background Element */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className="absolute -top-[10%] -right-[10%] w-[60%] h-[40%] bg-secondary-container/5 rounded-full blur-[120px]"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[80%] h-[50%] bg-primary-container/5 rounded-full blur-[140px]"></div>
      </div>
    </div>
  );
}
