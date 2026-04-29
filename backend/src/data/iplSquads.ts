/**
 * IPL 2026 — latest Playing XIs + most-recently-deployed Impact Player + the
 * remaining four impact-sub options on the bench. Compiled April 26, 2026
 * from each team's most recent completed fixture.
 *
 * Used by the Punter Card generator at midnight on match day, before the
 * actual XI for the upcoming match is announced. Roles drive option-pool
 * filtering: "Top Batter" excludes pure bowlers, "Top Bowler" excludes pure
 * batters, "Player of the Match" includes everyone.
 *
 * Order convention per squad:
 *   1–11: Playing XI in batting order
 *   12:   Impact Player who actually came on in that match
 *   13–16: remaining four impact-sub options on the bench
 *
 * Refresh once per season after the auction settles, then update when team
 * rotations stabilise.
 */

export type PlayerRole = "bat" | "wk" | "all" | "bowl";

export interface Player {
  name: string;
  role: PlayerRole;
}

export const IPL_SQUADS_2026: Record<string, Player[]> = {
  RCB: [
    { name: "Virat Kohli", role: "bat" },
    { name: "Devdutt Padikkal", role: "bat" },
    { name: "Rajat Patidar", role: "bat" },
    { name: "Jitesh Sharma", role: "wk" },
    { name: "Tim David", role: "bat" },
    { name: "Romario Shepherd", role: "all" },
    { name: "Krunal Pandya", role: "all" },
    { name: "Bhuvneshwar Kumar", role: "bowl" },
    { name: "Josh Hazlewood", role: "bowl" },
    { name: "Suyash Sharma", role: "bowl" },
    { name: "Rasikh Salam", role: "bowl" },
    { name: "Jacob Bethell", role: "all" },
    { name: "Phil Salt", role: "wk" },
    { name: "Jordan Cox", role: "bat" },
    { name: "Yash Dayal", role: "bowl" },
    { name: "Swapnil Singh", role: "all" },
  ],
  GT: [
    { name: "Shubman Gill", role: "bat" },
    { name: "B. Sai Sudharsan", role: "bat" },
    { name: "Jos Buttler", role: "wk" },
    { name: "Washington Sundar", role: "all" },
    { name: "Glenn Phillips", role: "bat" },
    { name: "Rahul Tewatia", role: "all" },
    { name: "Jason Holder", role: "all" },
    { name: "Rashid Khan", role: "bowl" },
    { name: "Kagiso Rabada", role: "bowl" },
    { name: "Mohammed Siraj", role: "bowl" },
    { name: "Prasidh Krishna", role: "bowl" },
    { name: "Shahrukh Khan", role: "bat" },
    { name: "Manav Suthar", role: "bowl" },
    { name: "Anuj Rawat", role: "wk" },
    { name: "Nishant Sindhu", role: "all" },
    { name: "Arshad Khan", role: "all" },
  ],
  MI: [
    { name: "Rohit Sharma", role: "bat" },
    { name: "Ryan Rickleton", role: "wk" },
    { name: "Suryakumar Yadav", role: "bat" },
    { name: "Hardik Pandya", role: "all" },
    { name: "Tilak Varma", role: "bat" },
    { name: "Naman Dhir", role: "bat" },
    { name: "Will Jacks", role: "all" },
    { name: "Mitchell Santner", role: "all" },
    { name: "Jasprit Bumrah", role: "bowl" },
    { name: "Trent Boult", role: "bowl" },
    { name: "Deepak Chahar", role: "bowl" },
    { name: "Ashwani Kumar", role: "bowl" },
    { name: "Corbin Bosch", role: "all" },
    { name: "Quinton de Kock", role: "wk" },
    { name: "Allah Ghazanfar", role: "bowl" },
    { name: "Shardul Thakur", role: "all" },
  ],
  CSK: [
    { name: "Ruturaj Gaikwad", role: "bat" },
    { name: "Sanju Samson", role: "wk" },
    { name: "Sarfaraz Khan", role: "bat" },
    { name: "Dewald Brevis", role: "bat" },
    { name: "Shivam Dube", role: "all" },
    { name: "Kartik Sharma", role: "bat" },
    { name: "Jamie Overton", role: "all" },
    { name: "MS Dhoni", role: "wk" },
    { name: "Noor Ahmad", role: "bowl" },
    { name: "Anshul Kamboj", role: "bowl" },
    { name: "Gurjapneet Singh", role: "bowl" },
    { name: "Akeal Hosein", role: "bowl" },
    { name: "Matthew Short", role: "all" },
    { name: "Prashant Veer", role: "bowl" },
    { name: "Matt Henry", role: "bowl" },
    { name: "Mukesh Choudhary", role: "bowl" },
  ],
  LSG: [
    { name: "Mitchell Marsh", role: "all" },
    { name: "Ayush Badoni", role: "bat" },
    { name: "Rishabh Pant", role: "wk" },
    { name: "Nicholas Pooran", role: "bat" },
    { name: "Aiden Markram", role: "bat" },
    { name: "Matthew Breetzke", role: "bat" },
    { name: "Himmat Singh", role: "bat" },
    { name: "George Linde", role: "all" },
    { name: "Mohammed Shami", role: "bowl" },
    { name: "Prince Yadav", role: "bowl" },
    { name: "Mohsin Khan", role: "bowl" },
    { name: "Mayank Yadav", role: "bowl" },
    { name: "Mukul Choudhary", role: "bowl" },
    { name: "Digvesh Singh Rathi", role: "bowl" },
    { name: "M. Siddharth", role: "bowl" },
    { name: "Abdul Samad", role: "bat" },
  ],
  RR: [
    { name: "Yashasvi Jaiswal", role: "bat" },
    { name: "Vaibhav Sooryavanshi", role: "bat" },
    { name: "Dhruv Jurel", role: "wk" },
    { name: "Riyan Parag", role: "all" },
    { name: "Shimron Hetmyer", role: "bat" },
    { name: "Donovan Ferreira", role: "bat" },
    { name: "Ravindra Jadeja", role: "all" },
    { name: "Jofra Archer", role: "bowl" },
    { name: "Ravi Bishnoi", role: "bowl" },
    { name: "Brijesh Sharma", role: "bowl" },
    { name: "Nandre Burger", role: "bowl" },
    { name: "Lhuan-dre Pretorius", role: "bat" },
    { name: "Shubham Dubey", role: "bat" },
    { name: "Tushar Deshpande", role: "bowl" },
    { name: "Yash Raj Punja", role: "bat" },
    { name: "Ravi Singh", role: "bowl" },
  ],
  SRH: [
    { name: "Abhishek Sharma", role: "bat" },
    { name: "Ishan Kishan", role: "bat" },
    { name: "Heinrich Klaasen", role: "wk" },
    { name: "Travis Head", role: "bat" },
    { name: "Aniket Verma", role: "bat" },
    { name: "Nitish Kumar Reddy", role: "all" },
    { name: "Pat Cummins", role: "all" },
    { name: "Salil Arora", role: "wk" },
    { name: "Shivang Kumar", role: "bowl" },
    { name: "Sakib Hussain", role: "bowl" },
    { name: "Eshan Malinga", role: "bowl" },
    { name: "Praful Hinge", role: "all" },
    { name: "Harsh Dubey", role: "all" },
    { name: "Liam Livingstone", role: "all" },
    { name: "Harshal Patel", role: "bowl" },
    { name: "Dilshan Madushanka", role: "bowl" },
  ],
  DC: [
    { name: "KL Rahul", role: "wk" },
    { name: "Pathum Nissanka", role: "bat" },
    { name: "Sameer Rizvi", role: "bat" },
    { name: "Axar Patel", role: "all" },
    { name: "Nitish Rana", role: "bat" },
    { name: "Tristan Stubbs", role: "bat" },
    { name: "David Miller", role: "bat" },
    { name: "Kuldeep Yadav", role: "bowl" },
    { name: "T. Natarajan", role: "bowl" },
    { name: "Lungi Ngidi", role: "bowl" },
    { name: "Mukesh Kumar", role: "bowl" },
    { name: "Karun Nair", role: "bat" },
    { name: "Ashutosh Sharma", role: "bat" },
    { name: "Tripurana Vijay", role: "bat" },
    { name: "Auqib Nabi", role: "bowl" },
    { name: "Dushmantha Chameera", role: "bowl" },
  ],
  PBKS: [
    { name: "Prabhsimran Singh", role: "wk" },
    { name: "Priyansh Arya", role: "bat" },
    { name: "Cooper Connolly", role: "all" },
    { name: "Shreyas Iyer", role: "bat" },
    { name: "Shashank Singh", role: "bat" },
    { name: "Marcus Stoinis", role: "all" },
    { name: "Marco Jansen", role: "all" },
    { name: "Arshdeep Singh", role: "bowl" },
    { name: "Yuzvendra Chahal", role: "bowl" },
    { name: "Xavier Bartlett", role: "bowl" },
    { name: "Vyshak Vijaykumar", role: "bowl" },
    { name: "Nehal Wadhera", role: "bat" },
    { name: "Harpreet Brar", role: "all" },
    { name: "Suryansh Shedge", role: "all" },
    { name: "Yash Thakur", role: "bowl" },
    { name: "Vishnu Vinod", role: "wk" },
  ],
  KKR: [
    { name: "Finn Allen", role: "bat" },
    { name: "Ajinkya Rahane", role: "bat" },
    { name: "Angkrish Raghuvanshi", role: "wk" },
    { name: "Cameron Green", role: "all" },
    { name: "Rinku Singh", role: "bat" },
    { name: "Ramandeep Singh", role: "all" },
    { name: "Sunil Narine", role: "all" },
    { name: "Anukul Roy", role: "all" },
    { name: "Varun Chakaravarthy", role: "bowl" },
    { name: "Vaibhav Arora", role: "bowl" },
    { name: "Kartik Tyagi", role: "bowl" },
    { name: "Tim Seifert", role: "wk" },
    { name: "Manish Pandey", role: "bat" },
    { name: "Rovman Powell", role: "bat" },
    { name: "Tejasvi Dahiya", role: "all" },
    { name: "Navdeep Saini", role: "bowl" },
  ],
};

// Backwards-compat: name-only list (preserves callers that just need
// `string[]`, e.g. resolveSquadPool's outer signature).
export function squadForTeam(short: string | null | undefined): string[] | null {
  if (!short) return null;
  const sq = IPL_SQUADS_2026[short.toUpperCase()];
  return sq ? sq.map((p) => p.name) : null;
}

// Role-aware: full Player[] list for a team. Merges the static seed list
// with any SquadOverride rows written by the post-match squad sync — so the
// next match's punter card generator pulls from the freshest player set,
// not just whatever was hand-curated at season start.
//
// Merge rules:
//   - Players in the static squad are always included (with their static role).
//   - Override rows whose name matches a static player update the role only
//     when the override role is "stronger" (bat → all → bowl never downgrades
//     a wk; we keep wk explicit).
//   - Override rows whose name doesn't appear in the static squad are
//     appended as new players.
export async function squadWithRolesForTeam(short: string | null | undefined): Promise<Player[] | null> {
  if (!short) return null;
  const team = short.toUpperCase();
  const base = IPL_SQUADS_2026[team];
  if (!base) return null;

  // Lazy-load the model to avoid a circular import (models/index.ts
  // imports utility code, and this file might be reached during model init
  // in pathological test setups).
  let overrides: Array<{ playerName: string; role: PlayerRole }> = [];
  try {
    const { SquadOverride } = await import("../models");
    const rows = await SquadOverride.findAll({
      where: { team, removedAt: null },
      attributes: ["playerName", "role"],
    });
    overrides = rows.map((r) => ({ playerName: r.playerName, role: r.role as PlayerRole }));
  } catch {
    // Table may not exist yet on a fresh deploy before sequelize.sync
    // creates it. Fall back to static-only — same behaviour as v1.
    return base;
  }

  const merged: Player[] = base.map((p) => ({ ...p }));
  const baseLowerToIdx = new Map<string, number>();
  base.forEach((p, i) => baseLowerToIdx.set(p.name.toLowerCase(), i));

  for (const o of overrides) {
    const lower = o.playerName.toLowerCase();
    const idx = baseLowerToIdx.get(lower);
    if (idx != null) {
      // Player already in the static squad. Promote the role only when the
      // override is more specific than `bat` (the inferRole default for an
      // unknown player) — we don't want to downgrade a wk → bat just
      // because the auto-sync defaulted them.
      const current = merged[idx].role;
      if (current === "bat" && (o.role === "bowl" || o.role === "all" || o.role === "wk")) {
        merged[idx] = { name: merged[idx].name, role: o.role };
      }
    } else {
      merged.push({ name: o.playerName, role: o.role });
    }
  }
  return merged;
}

// Global name → role lookup (search across every squad). Used to enrich
// raw `string[]` lineups (e.g. arrived via Sportsmonk) with role metadata.
const NAME_ROLE_INDEX: Map<string, PlayerRole> = (() => {
  const m = new Map<string, PlayerRole>();
  for (const squad of Object.values(IPL_SQUADS_2026)) {
    for (const p of squad) {
      // Normalize on lower-case + collapsed whitespace so minor
      // punctuation/casing differences in the upstream feed still match.
      m.set(p.name.toLowerCase().trim(), p.role);
    }
  }
  return m;
})();

export function getPlayerRole(name: string): PlayerRole | null {
  if (!name) return null;
  return NAME_ROLE_INDEX.get(name.toLowerCase().trim()) || null;
}
