// Brand colours for every IPL franchise. Used by the Punter Card to paint
// a per-match gradient background (team1Dark → black → team2Dark) and to
// pick the primary fill for the team-shortcode badge in the header pill.
//
// `primary` — saturated brand colour, used for the badge fill and the
//             radial-highlight glow at each corner of the card background.
// `dark`    — primary at ~30% lightness, used as the gradient stop so the
//             whole-page background reads "team colour" without nuking
//             white text legibility.
// `text`    — colour for text drawn ON TOP of the primary fill (CSK
//             yellow needs black text; everyone else gets white).

export interface TeamColor {
  primary: string;
  dark: string;
  text: string;
}

export const TEAM_COLORS: Record<string, TeamColor> = {
  CSK:  { primary: "#FDB913", dark: "#6b4f00", text: "#0a0a0a" },
  MI:   { primary: "#045093", dark: "#032a4d", text: "#ffffff" },
  KKR:  { primary: "#7B3FE4", dark: "#2a1456", text: "#ffffff" },
  RCB:  { primary: "#DA1818", dark: "#6b0a0a", text: "#ffffff" },
  RR:   { primary: "#EA1A85", dark: "#6f0c40", text: "#ffffff" },
  DC:   { primary: "#1A4FB4", dark: "#0a2356", text: "#ffffff" },
  PBKS: { primary: "#DD1F2D", dark: "#6b0e16", text: "#ffffff" },
  SRH:  { primary: "#FF6700", dark: "#803300", text: "#ffffff" },
  LSG:  { primary: "#2D6195", dark: "#163050", text: "#ffffff" },
  GT:   { primary: "#1B2133", dark: "#0c0f1a", text: "#ffffff" },
};

// Neutral fallback for non-IPL fixtures (international warm-ups, exhibition
// matches) so the page never renders without a gradient.
const FALLBACK: TeamColor = { primary: "#ff6341", dark: "#5b1278", text: "#ffffff" };

export function getTeamColor(short: string | null | undefined): TeamColor {
  if (!short) return FALLBACK;
  return TEAM_COLORS[short.toUpperCase()] || FALLBACK;
}
