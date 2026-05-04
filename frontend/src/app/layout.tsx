import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { GameProvider } from "@/context/GameContext";
import { NotificationProvider } from "@/context/NotificationContext";
import WinPopup from "@/components/WinPopup";
import BananaShower from "@/components/BananaShower";
import { SAFE_BOOT } from "@/lib/runtime-flags";
import "./globals.css";

export const metadata: Metadata = {
  title: "JAFFA - Predict. Play. Win.",
  description:
    "IPL prediction game. Predict from anywhere, climb the leaderboard, enjoy your rewards.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "JAFFA",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0d0d0d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Wrap with NotificationProvider so the per-user "you got it right!" socket
  // listener stays alive across all pages, not just the match page. WinPopup
  // sits at the top so it floats above any page chrome.
  const content = SAFE_BOOT ? (
    children
  ) : (
    <GameProvider>
      <NotificationProvider>
        {children}
        <WinPopup />
        {/* Floating "+N 🍌" celebration overlay — listens to `banana.awarded`
            socket events and drifts a chip up the screen. Bananas are
            credited the moment the event fires (no tap required); the tap
            interaction just lets a playful user flick the chip off-screen
            faster. Sits at the root so any page benefits. */}
        <BananaShower />
      </NotificationProvider>
    </GameProvider>
  );

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Bungee&family=Barlow:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#0d0d0d] text-white antialiased">
        {content}
        {!SAFE_BOOT && (
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "#1a1a1a",
                border: "2px solid #ff6341",
                borderRadius: "4px",
                boxShadow: "4px 4px 0 0 #ff6341",
                color: "#ffffff",
                fontWeight: 700,
                textTransform: "uppercase" as const,
                fontSize: "0.875rem",
              },
            }}
          />
        )}
      </body>
    </html>
  );
}
