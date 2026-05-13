// Map of jerseyTeam shortcode → public path to that team's GLB asset.
// Phase 1b: only KKR has a 3D model. Other teams render via the
// procedural SVG `CricketAvatar`. Add a new entry whenever a new team's
// Meshy export lands in /public/avatars/.

export const TEAM_3D_MODELS: Readonly<Partial<Record<string, string>>> = {
  KKR: "/avatars/kkr.glb",
  // MI:   "/avatars/mi.glb",
  // CSK:  "/avatars/csk.glb",
  // RCB:  "/avatars/rcb.glb",
  // DC:   "/avatars/dc.glb",
  // GT:   "/avatars/gt.glb",
  // LSG:  "/avatars/lsg.glb",
  // PBKS: "/avatars/pbks.glb",
  // RR:   "/avatars/rr.glb",
  // SRH:  "/avatars/srh.glb",
};

// Returns the GLB url for a team, or null if that team doesn't have a
// 3D model yet (caller should fall back to the SVG avatar).
export function get3DModelForTeam(team: string | undefined | null): string | null {
  if (!team) return null;
  return TEAM_3D_MODELS[team.toUpperCase()] ?? null;
}
