// Store + Powerups client. Reuses the regular user JWT token like lib/api.ts.

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

async function storeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jaffa_token") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Request failed" }));
      const err: any = new Error(data.error || "Request failed");
      err.body = data;
      err.status = res.status;
      throw err;
    }
    return res.json();
  } catch (err: any) {
    if (err.name === "AbortError") throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export type PowerupKey =
  | "gorilla_guard"
  | "chimp_tank"
  | "banana_berserk"
  | "silverback_clutch"
  | "monke_mayhem";

export type PowerupStatus = "owned" | "active" | "consumed";

export interface CatalogItem {
  key: PowerupKey;
  name: string;
  shortName: string;
  description: string;
  price: number;
  weeklyCap: number | null;
  weeklyRemaining: number | null;
  oneLifetime: boolean;
  ownedLifetime: boolean;
}

export interface InventoryRow {
  id: string;
  powerupKey: PowerupKey;
  status: PowerupStatus;
  matchId: string | null;
  chargesRemaining: number | null;
  metadata: Record<string, any> | null;
  activatedAt: string | null;
  purchasedAt: string;
  boundToMatch?: boolean;
}

export const storeApi = {
  catalog: () =>
    storeRequest<{ bananas: number; items: CatalogItem[] }>("/store/catalog"),

  purchase: (powerupKey: PowerupKey) =>
    storeRequest<{ powerup: InventoryRow; bananas: number }>("/store/purchase", {
      method: "POST",
      body: JSON.stringify({ powerupKey }),
    }),

  inventory: (matchId?: string) =>
    storeRequest<{ powerups: InventoryRow[] }>(
      `/store/inventory${matchId ? `?matchId=${matchId}` : ""}`,
    ),

  ledger: (page = 1) =>
    storeRequest<{ ledger: any[]; totalPages: number }>(`/store/ledger?page=${page}`),
};

export const powerupsApi = {
  active: (matchId: string) =>
    storeRequest<{ powerups: InventoryRow[] }>(`/powerups/active?matchId=${encodeURIComponent(matchId)}`),

  activate: (powerupId: string, matchId: string, targetOverNumber?: number) =>
    storeRequest<{ powerup: InventoryRow }>(`/powerups/${powerupId}/activate`, {
      method: "POST",
      body: JSON.stringify({ matchId, targetOverNumber }),
    }),

  useChimpTank: (predictionId: string) =>
    storeRequest<{ responses: Record<string, number>; totalResponses: number; chargesRemaining: number }>(
      "/powerups/chimp-tank/use",
      { method: "POST", body: JSON.stringify({ predictionId }) },
    ),
};

// Display table — mirrors backend POWERUP_CATALOG. Used by store cards +
// the in-match tray for icons/colors.
export const POWERUP_VIEW: Record<PowerupKey, { emoji: string; color: string; tagline: string }> = {
  gorilla_guard:     { emoji: "🛡️", color: "#22c55e", tagline: "Streak shield × 2" },
  chimp_tank:        { emoji: "🔭", color: "#3b9eff", tagline: "Crowd intel × 3" },
  banana_berserk:    { emoji: "🐒", color: "#ff6341", tagline: "1x-5x next over" },
  silverback_clutch: { emoji: "🦍", color: "#ffd60a", tagline: "Permanent 2x last 2 overs" },
  monke_mayhem:      { emoji: "🎲", color: "#a855f7", tagline: "Pick 2 on player Qs" },
};
