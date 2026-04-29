// Robust player-name resolution between our static squad data
// (backend/src/data/iplSquads.ts) and Sportsmonk's `batsman.fullname` /
// `bowler.fullname` strings on the ball-by-ball feed.
//
// Why this exists: a real PBKS-vs-RR match resolved 2 punter card head-to-head
// questions WRONG because the squad name "Prabhsimran Singh" didn't exact-match
// Sportsmonk's "Prabh Simran Singh" (or vice-versa), so the runs lookup
// returned null → the fallback shape ("Tie" / "Neither bats") got served as
// the correct answer. This module gives the resolver a fuzzy fallback +
// explicit alias table so the same mismatch doesn't silently break scoring.

// Lowercase, strip punctuation (dots, apostrophes, hyphens, parens), collapse
// whitespace. Keeps internal letters + spaces only — what tokenisation needs.
export function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Known finicky cases worth hard-coding so they're greppable / auditable.
// Keys are squad-side names (as authored in iplSquads.ts); values are the
// list of known Sportsmonk-side variants. The resolver checks the alias
// table BEFORE running the fuzzy match — explicit > heuristic.
//
// Add new entries as you find them; growing this map is cheaper and safer
// than loosening the fuzzy threshold.
const KNOWN_ALIASES: Record<string, string[]> = {
  "Prabhsimran Singh": ["Prabh Simran Singh", "Prabhsimran S"],
  "KL Rahul":          ["Lokesh Rahul", "K L Rahul"],
  "Faf du Plessis":    ["Faf Du Plessis"],
  "B. Sai Sudharsan":  ["B Sai Sudharsan", "Sai Sudharsan"],
  "Ryan Rickleton":    ["Ryan Rickelton"],
  "MS Dhoni":          ["M S Dhoni", "Mahendra Singh Dhoni"],
};

// Pre-build a lookup of every alias variant → canonical squad name. Allows
// the resolver to run "did we explicitly map THIS Sportsmonk fullname?" in
// a single Map.get() rather than scanning the table for each call.
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, variants] of Object.entries(KNOWN_ALIASES)) {
  ALIAS_TO_CANONICAL.set(normalizePlayerName(canonical), canonical);
  for (const v of variants) {
    ALIAS_TO_CANONICAL.set(normalizePlayerName(v), canonical);
  }
}

// Token-set overlap ratio. Splits both names into normalized whitespace tokens,
// returns |intersect| / max(|A|, |B|). 1.0 = identical token set; 0 = disjoint.
//
// Use max-not-min in the denominator so "Sanju" vs "Sanju Samson" scores 0.5
// (1 ∩ 2 / max(1,2) = 0.5) — *below* the recommended 0.6 threshold. That
// stops a single first-name in a question option from greedily matching a
// full-name in the ball feed.
export function tokenSetOverlap(a: string, b: string): number {
  const aTokens = new Set(normalizePlayerName(a).split(" ").filter(Boolean));
  const bTokens = new Set(normalizePlayerName(b).split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let inter = 0;
  for (const t of aTokens) if (bTokens.has(t)) inter += 1;
  return inter / Math.max(aTokens.size, bTokens.size);
}

// What kind of role we're resolving against. Determines which field on each
// ball we read for "this fullname appeared in the match".
type ResolveRole = "batsman" | "bowler" | "any";

// Collect the set of unique fullnames seen in the ball feed for the requested
// role. Cached per-role to avoid re-walking allBalls 4 times when the same
// match resolves multiple head-to-heads in one finalizeMatch pass.
function uniqueFullnames(allBalls: any[], role: ResolveRole): Set<string> {
  const out = new Set<string>();
  for (const b of allBalls) {
    if (role === "batsman" || role === "any") {
      const n = b?.batsman?.fullname;
      if (typeof n === "string" && n.trim()) out.add(n.trim());
    }
    if (role === "bowler" || role === "any") {
      const n = b?.bowler?.fullname;
      if (typeof n === "string" && n.trim()) out.add(n.trim());
    }
  }
  return out;
}

// Resolve a squad-side player name to the actual fullname Sportsmonk uses
// in this match's balls. Returns null when no candidate is good enough —
// callers should treat that as "the player didn't feature OR our data is
// too stale to know" and prefer VOIDing the question over guessing.
//
// Threshold (0.6) tuned against:
//   - "Prabhsimran Singh" vs "Prabh Simran Singh"  → 2/2 = 1.0  ✓ match
//   - "Faf du Plessis"    vs "Faf Du Plessis"      → 3/3 = 1.0  ✓ match
//   - "Sanju Samson"      vs "Sanju"               → 1/2 = 0.5  ✗ rejected
//   - "Shreyas Iyer"      vs "Iyer"                → 1/2 = 0.5  ✗ rejected
//   - "Cooper Connolly"   vs "Cooper"              → 1/2 = 0.5  ✗ rejected
//
// First-name-only candidates from Sportsmonk would be a real bug we'd want
// to know about loudly, not silently fuzzy-merge into the wrong player.
const FUZZY_THRESHOLD = 0.6;

// Generic fuzzy matcher — squad name against ANY iterable of candidate
// strings (ball-feed fullnames, lineup XI names, an override-table list,
// etc.). Three-tier match: exact-normalized → alias-table → fuzzy token-set.
// Returns the matched candidate (preserving its original casing) or null.
export function findFuzzyMatch(
  squadName: string,
  candidates: Iterable<string>,
): string | null {
  if (!squadName) return null;
  const target = normalizePlayerName(squadName);

  // Materialize once — the iteration runs 3x below.
  const list: string[] = [];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) list.push(c);
  }
  if (list.length === 0) return null;

  // 1. Exact normalized — handles punctuation / case-only diffs.
  for (const c of list) {
    if (normalizePlayerName(c) === target) return c;
  }

  // 2. Alias-table — explicit known-finicky cases.
  const aliasCanonical = ALIAS_TO_CANONICAL.get(target);
  if (aliasCanonical) {
    const variants = KNOWN_ALIASES[aliasCanonical] || [];
    for (const c of list) {
      const cn = normalizePlayerName(c);
      if (cn === normalizePlayerName(aliasCanonical)) return c;
      if (variants.some((v) => normalizePlayerName(v) === cn)) return c;
    }
  }
  // Reverse direction.
  for (const c of list) {
    const back = ALIAS_TO_CANONICAL.get(normalizePlayerName(c));
    if (back && normalizePlayerName(back) === target) return c;
  }

  // 3. Token-set fuzzy. Highest score above threshold wins; alphabetical tie-break.
  let best: { name: string; score: number } | null = null;
  for (const c of list) {
    const score = tokenSetOverlap(squadName, c);
    if (score < FUZZY_THRESHOLD) continue;
    if (!best || score > best.score || (score === best.score && c < best.name)) {
      best = { name: c, score };
    }
  }
  return best?.name ?? null;
}

// Resolve a squad-side player name to the actual fullname Sportsmonk uses
// in this match's balls. Returns null when no candidate is good enough —
// callers should treat that as "the player didn't feature OR our data is
// too stale to know" and prefer VOIDing the question over guessing.
//
// Threshold (0.6) tuned against:
//   - "Prabhsimran Singh" vs "Prabh Simran Singh"  → 2/2 = 1.0  ✓ match
//   - "Faf du Plessis"    vs "Faf Du Plessis"      → 3/3 = 1.0  ✓ match
//   - "Sanju Samson"      vs "Sanju"               → 1/2 = 0.5  ✗ rejected
//   - "Shreyas Iyer"      vs "Iyer"                → 1/2 = 0.5  ✗ rejected
//
// First-name-only candidates from Sportsmonk would be a real bug we'd want
// to know about loudly, not silently fuzzy-merge into the wrong player.
export function resolveBallName(
  squadName: string,
  allBalls: any[],
  role: ResolveRole = "batsman",
): string | null {
  if (allBalls.length === 0) return null;
  return findFuzzyMatch(squadName, uniqueFullnames(allBalls, role));
}

// Convenience for callers who want the resolved name OR the original (used
// when we want to attempt the lookup but degrade gracefully if no balls
// were emitted yet — e.g. during pre-match question generation).
export function resolveOrFallback(squadName: string, allBalls: any[], role: ResolveRole = "batsman"): string {
  return resolveBallName(squadName, allBalls, role) ?? squadName;
}

// "Is the squad-named player in the announced playing XI?" with the same
// fuzzy matching used for ball lookup. Callers pass the union of team1Players
// + team2Players from match.* — null/empty list → returns true (we don't have
// XI data yet, so don't penalize the question).
export function isInLineup(squadName: string, lineup: string[] | null | undefined): boolean {
  if (!lineup || lineup.length === 0) return true;
  return findFuzzyMatch(squadName, lineup) !== null;
}
