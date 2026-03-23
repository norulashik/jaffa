"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/context/GameContext";
import { api } from "@/lib/api";

interface OTPFlowProps {
  onComplete: () => void;
}

export default function OTPFlow({ onComplete }: OTPFlowProps) {
  const { dispatch } = useGame();
  const [step, setStep] = useState<"phone" | "otp" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOTP = async () => {
    if (phone.length < 10) {
      setError("Enter a valid phone number");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.sendOTP(phone.startsWith("+91") ? phone : `+91${phone}`);
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (code: string) => {
    setError("");
    setLoading(true);
    try {
      const fullPhone = phone.startsWith("+91") ? phone : `+91${phone}`;
      const result = await api.verifyOTP(fullPhone, code);

      if (result.needsDisplayName) {
        setStep("name");
        setLoading(false);
        return;
      }

      localStorage.setItem("jaffa_token", result.token);
      dispatch({ type: "SET_USER", user: result.user, token: result.token });
      onComplete();
    } catch (err: any) {
      setError(err.message);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    }
    setLoading(false);
  };

  const handleSetName = async () => {
    if (displayName.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const fullPhone = phone.startsWith("+91") ? phone : `+91${phone}`;
      const code = otp.join("");
      // OTP was NOT consumed on first verify (server keeps it valid for displayName step)
      const result = await api.verifyOTP(fullPhone, code, displayName);

      if (result.token) {
        localStorage.setItem("jaffa_token", result.token);
        dispatch({ type: "SET_USER", user: result.user, token: result.token });
        onComplete();
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits entered
    if (value && index === 5) {
      const code = newOtp.join("");
      if (code.length === 6) {
        handleVerifyOTP(code);
      }
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 0) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || "";
    }
    setOtp(newOtp);

    // Focus last filled field
    const lastIndex = Math.min(pasted.length - 1, 5);
    otpRefs.current[lastIndex]?.focus();

    // Auto-submit if all 6 digits pasted
    if (pasted.length === 6) {
      handleVerifyOTP(pasted);
    }
  };

  const handleResendOTP = async () => {
    setError("");
    setLoading(true);
    try {
      const fullPhone = phone.startsWith("+91") ? phone : `+91${phone}`;
      await api.sendOTP(fullPhone);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-sm"
      >
        <h1 className="text-4xl font-black text-orange-500 text-center mb-8">JAFFA</h1>

        <AnimatePresence mode="wait">
          {/* Phone Input */}
          {step === "phone" && (
            <motion.div
              key="phone"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
            >
              <p className="text-white text-lg font-semibold mb-2">Enter your phone number</p>
              <p className="text-slate-400 text-sm mb-6">We'll send you a one-time code</p>

              <div className="flex items-center gap-2 mb-4">
                <div className="bg-slate-800 text-slate-300 px-3 py-3.5 rounded-xl text-sm font-medium">
                  +91
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="Your phone number"
                  className="flex-1 bg-slate-800 text-white px-4 py-3.5 rounded-xl text-lg outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-600"
                  autoFocus
                />
              </div>

              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              <button
                onClick={handleSendOTP}
                disabled={loading || phone.length < 10}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </motion.div>
          )}

          {/* OTP Input */}
          {step === "otp" && (
            <motion.div
              key="otp"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
            >
              <p className="text-white text-lg font-semibold mb-2">Enter the code</p>
              <p className="text-slate-400 text-sm mb-6">
                Sent to +91 {phone}
              </p>

              <div className="flex gap-2 justify-center mb-6">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="tel"
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={i === 0 ? handleOtpPaste : undefined}
                    className="w-12 h-14 bg-slate-800 text-white text-center text-xl font-bold rounded-xl outline-none focus:ring-2 focus:ring-orange-500"
                    maxLength={1}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
              {loading && <p className="text-orange-400 text-sm text-center animate-pulse">Verifying...</p>}

              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={() => { setStep("phone"); setOtp(["", "", "", "", "", ""]); }}
                  className="text-slate-500 text-sm hover:text-slate-300"
                >
                  Change number
                </button>
                <button
                  onClick={handleResendOTP}
                  disabled={loading}
                  className="text-orange-400 text-sm hover:text-orange-300 disabled:text-slate-600"
                >
                  Resend code
                </button>
              </div>
            </motion.div>
          )}

          {/* Display Name */}
          {step === "name" && (
            <motion.div
              key="name"
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
            >
              <p className="text-white text-lg font-semibold mb-2">Pick a display name</p>
              <p className="text-slate-400 text-sm mb-6">This shows on the leaderboard</p>

              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 20))}
                placeholder="Your name or nickname"
                className="w-full bg-slate-800 text-white px-4 py-3.5 rounded-xl text-lg outline-none focus:ring-2 focus:ring-orange-500 placeholder:text-slate-600 mb-4"
                autoFocus
              />

              {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

              <button
                onClick={handleSetName}
                disabled={loading || displayName.length < 2}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3.5 rounded-xl transition-colors"
              >
                {loading ? "Setting up..." : "Let's Go!"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
