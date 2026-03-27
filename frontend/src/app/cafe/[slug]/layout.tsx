"use client";

import { useEffect, useState, ReactNode } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

export default function CafeLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");

  useEffect(() => {
    if (!slug) return;

    // Check if we already validated this slug
    const cachedSlug = localStorage.getItem("jaffa_venue_slug");
    if (cachedSlug === slug) {
      setStatus("valid");
      return;
    }

    // Validate via API
    api.getVenueBySlug(slug)
      .then((data) => {
        localStorage.setItem("jaffa_venue_id", data.id);
        localStorage.setItem("jaffa_venue_name", data.name);
        localStorage.setItem("jaffa_venue_slug", data.slug);
        setStatus("valid");
      })
      .catch(() => {
        setStatus("invalid");
      });
  }, [slug]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-primary-container border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-6xl mb-4">🏏</div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">Venue Not Found</h1>
          <p className="text-on-surface-variant text-sm">This cafe link is invalid or no longer active.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
