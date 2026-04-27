"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { IoCall } from "react-icons/io5";
import { User, ArrowRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import { cafeUrl, isCafeRoute } from "@/lib/navigation";

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
  // Two-step gating: "phone" reveals only the phone field + Continue; the
  // backend tells us on step 1 whether the user is new (Nickname required
  // 400) or existing (success → log in immediately). For new users we
  // flip to "nickname" step which reveals the nickname field. Existing
  // users never see the nickname field at all — fixing the long-standing
  // UX papercut where returning users were asked for a nickname every
  // time and then collided with their own existing record.
  const [step, setStep] = useState<"phone" | "nickname">("phone");
  // Hold the form back until we've checked localStorage for an existing
  // session. Without this the login form briefly flashes for already-logged-in
  // users before the redirect fires, making them think they need to log in
  // again. Initial true → render a quiet loader; flips to false only when we
  // confirm there's no token to redirect with.
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("jaffa_token");
    if (token) {
      router.replace(isCafeRoute() ? cafeUrl("/lobby") : "/lobby");
      return;
    }
    setCheckingAuth(false);
    if (isCafeRoute()) {
      const venueId = localStorage.getItem("jaffa_venue_id");
      if (venueId) {
        api.getVenue(venueId).then((v) => setVenueName(v.name)).catch(() => {});
      }
    }
  }, [router]);

  // Single submit handler for both steps. On step 1 we send phone-only
  // and let the backend tell us if a nickname is needed; on step 2 we
  // include the nickname the user just typed.
  const handleSubmit = async () => {
    if (!phone || phone.length < 10) {
      setError("Please enter a valid 10-digit number");
      return;
    }
    if (step === "nickname" && !displayName.trim()) {
      setError("Please enter a nickname");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const name = step === "nickname" ? displayName.trim() : undefined;
      const result = await api.loginWithPhone(phone, name);
      localStorage.setItem("jaffa_token", result.token);
      localStorage.setItem("jaffa_user", JSON.stringify(result.user));
      router.push(isCafeRoute() ? cafeUrl("/lobby") : "/lobby");
    } catch (err: any) {
      const msg = String(err?.message || "");
      // Backend signals "this phone has no account yet" via this 400
      // payload. Reveal the nickname field instead of showing it as an
      // error. The user just continues filling out the form on the same
      // page — no second submit pass needed yet.
      if (msg.toLowerCase().includes("nickname is required")) {
        setStep("nickname");
        setError("");
      } else {
        setError(msg || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  // While we're checking for an existing session, render a quiet centred
  // spinner instead of the login form. Already-logged-in users see this
  // for one tick before the redirect to /lobby fires.
  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
        <div
          className="w-8 h-8 animate-spin"
          style={{ border: "3px solid #ff6341", borderTopColor: "transparent", borderRadius: "2px" }}
        />
      </div>
    );
  }

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
              <span>{step === "phone" ? "Enter Your Mobile Number" : "Pick a Nickname"}</span>
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
                    // Bumping the phone number invalidates a pending
                    // "needs nickname" prompt — drop the user back to step 1
                    // so we re-probe the new number cleanly.
                    if (step === "nickname") setStep("phone");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && step === "phone") handleSubmit();
                  }}
                  maxLength={10}
                  // Lock the phone field once we've revealed the nickname
                  // step so the user can't drift away from the number the
                  // backend just told us is new.
                  readOnly={step === "nickname"}
                />
              </div>
            </div>

            {step === "nickname" && (
              <div>
                <label className="text-white/60 block text-xs tracking-widest">
                  NICKNAME
                </label>
                <p className="text-white/50 text-[11px] mt-1 mb-2">
                  Looks like you're new here — pick a nickname to set up your account.
                </p>
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
                      if (e.key === "Enter") handleSubmit();
                    }}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-[#ff6341] text-xs font-bold uppercase">{error}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn-sticker btn-orange w-full py-4 flex items-center justify-center gap-2"
              style={BUNGEE}
            >
              {loading
                ? (step === "phone" ? "CHECKING..." : "JOINING...")
                : (step === "phone" ? "CONTINUE" : "START PLAYING")}
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
