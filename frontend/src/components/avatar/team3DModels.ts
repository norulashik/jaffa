// Map of jerseyTeam shortcode → public path to that team's GLB asset.
// Phase 1b: only KKR has a 3D model. Other teams render via the
// procedural SVG `CricketAvatar`. Add a new entry whenever a new team's
// Meshy export lands in /public/avatars/.

export const TEAM_3D_MODELS: Readonly<Partial<Record<string, string>>> = {
  KKR:  "/avatars/kkr.glb",
  CSK:  "/avatars/csk.glb",
  SRH:  "/avatars/srh.glb",
  RCB:  "/avatars/rcb.glb",
  NONE: "/avatars/default.glb",
  // MI:   "/avatars/mi.glb",
  // DC:   "/avatars/dc.glb",
  // GT:   "/avatars/gt.glb",
  // LSG:  "/avatars/lsg.glb",
  // PBKS: "/avatars/pbks.glb",
  // RR:   "/avatars/rr.glb",
};

// The Phase-2 default ape (red hoodie). Used for any user whose team
// doesn't yet have a dedicated GLB.
export const DEFAULT_3D_MODEL = "/avatars/default.glb";

// Returns the GLB url for a team, or null if that team doesn't have a
// 3D model yet (caller should fall back to the SVG avatar).
export function get3DModelForTeam(team: string | undefined | null): string | null {
  if (!team) return null;
  return TEAM_3D_MODELS[team.toUpperCase()] ?? null;
}

// Always returns a GLB url — the team's specific model if available,
// otherwise the default red-hoodie ape. Use this on profile + customizer
// where every user should see SOME 3D avatar.
export function get3DModelForTeamOrDefault(team: string | undefined | null): string {
  if (!team) return DEFAULT_3D_MODEL;
  return TEAM_3D_MODELS[team.toUpperCase()] ?? DEFAULT_3D_MODEL;
}
