/**
 * IPL 2026 — latest Playing XIs + most-recently-deployed Impact Player + the
 * remaining four impact-sub options on the bench. Compiled April 25, 2026
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
    { name: "Jordan Cox", role: "bat" },
    { name: "Mangesh Yadav", role: "bowl" },
    { name: "Vicky Ostwal", role: "bowl" },
    { name: "Venkatesh Iyer", role: "all" },
  ],
  GT: [
    { name: "Shubman Gill", role: "bat" },
    { name: "B. Sai Sudharsan", role: "bat" },
    { name: "Jos Buttler", role: "wk" },
    { name: "Washington Sundar", role: "all" },
    { name: "Jason Holder", role: "all" },
    { name: "Shahrukh Khan", role: "bat" },
    { name: "Rahul Tewatia", role: "all" },
    { name: "Rashid Khan", role: "bowl" },
    { name: "Manav Suthar", role: "bowl" },
    { name: "Kagiso Rabada", role: "bowl" },
    { name: "Mohammed Siraj", role: "bowl" },
    { name: "Prasidh Krishna", role: "bowl" },
    { name: "Anuj Rawat", role: "wk" },
    { name: "Glenn Phillips", role: "bat" },
    { name: "Nishant Sindhu", role: "all" },
    { name: "Arshad Khan", role: "all" },
  ],
  MI: [
    { name: "Quinton de Kock", role: "wk" },
    { name: "Naman Dhir", role: "bat" },
    { name: "Suryakumar Yadav", role: "bat" },
    { name: "Hardik Pandya", role: "all" },
    { name: "Tilak Varma", role: "bat" },
    { name: "Sherfane Rutherford", role: "bat" },
    { name: "Mitchell Santner", role: "all" },
    { name: "Jasprit Bumrah", role: "bowl" },
    { name: "Krish Bhagat", role: "bowl" },
    { name: "Allah Ghazanfar", role: "bowl" },
    { name: "Ashwani Kumar", role: "bowl" },
    { name: "Danish Malewar", role: "bat" },
    { name: "Will Jacks", role: "all" },
    { name: "Raj Bawa", role: "all" },
    { name: "Shardul Thakur", role: "bowl" },
    { name: "Mayank Rawat", role: "bat" },
  ],
  CSK: [
    { name: "Ruturaj Gaikwad", role: "bat" },
    { name: "Sanju Samson", role: "wk" },
    { name: "Sarfaraz Khan", role: "bat" },
    { name: "Dewald Brevis", role: "bat" },
    { name: "Shivam Dube", role: "all" },
    { name: "Kartik Sharma", role: "bat" },
    { name: "Jamie Overton", role: "all" },
    { name: "Anshul Kamboj", role: "bowl" },
    { name: "Noor Ahmad", role: "bowl" },
    { name: "Gurjapneet Singh", role: "bowl" },
    { name: "Mukesh Choudhary", role: "bowl" },
    { name: "Akeal Hosein", role: "bowl" },
    { name: "Prashant Veer", role: "bowl" },
    { name: "Matthew Short", role: "all" },
    { name: "Matt Henry", role: "bowl" },
    { name: "Urvil Patel", role: "wk" },
  ],
  LSG: [
    { name: "Mitchell Marsh", role: "all" },
    { name: "Ayush Badoni", role: "bat" },
    { name: "Rishabh Pant", role: "wk" },
    { name: "Nicholas Pooran", role: "bat" },
    { name: "Aiden Markram", role: "bat" },
    { name: "Mukul Choudhary", role: "bowl" },
    { name: "Mohammed Shami", role: "bowl" },
    { name: "Mohsin Khan", role: "bowl" },
    { name: "Mayank Yadav", role: "bowl" },
    { name: "Digvesh Singh Rathi", role: "bowl" },
    { name: "Prince Yadav", role: "bowl" },
    { name: "Himmat Singh", role: "bat" },
    { name: "George Linde", role: "all" },
    { name: "M. Siddharth", role: "bowl" },
    { name: "Matthew Breetzke", role: "bat" },
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
    { name: "Shubham Dubey", role: "bat" },
    { name: "Lhuan-dre Pretorius", role: "bat" },
    { name: "Ravi Singh", role: "bowl" },
    { name: "Yash Raj Punja", role: "bat" },
    { name: "Tushar Deshpande", role: "bowl" },
  ],
  SRH: [
    { name: "Abhishek Sharma", role: "bat" },
    { name: "Travis Head", role: "bat" },
    { name: "Ishan Kishan", role: "bat" },
    { name: "Heinrich Klaasen", role: "bat" },
    { name: "Salil Arora", role: "wk" },
    { name: "Aniket Verma", role: "bat" },
    { name: "Nitish Kumar Reddy", role: "all" },
    { name: "Shivang Kumar", role: "bowl" },
    { name: "Harsh Dubey", role: "all" },
    { name: "Sakib Hussain", role: "bowl" },
    { name: "Eshan Malinga", role: "bowl" },
    { name: "Dilshan Madushanka", role: "bowl" },
    { name: "R. Smaran", role: "bat" },
    { name: "Praful Hinge", role: "all" },
    { name: "Liam Livingstone", role: "all" },
    { name: "Harshal Patel", role: "bowl" },
  ],
  DC: [
    { name: "Pathum Nissanka", role: "bat" },
    { name: "KL Rahul", role: "wk" },
    { name: "Sameer Rizvi", role: "bat" },
    { name: "Nitish Rana", role: "bat" },
    { name: "Tristan Stubbs", role: "bat" },
    { name: "Axar Patel", role: "all" },
    { name: "David Miller", role: "bat" },
    { name: "Kuldeep Yadav", role: "bowl" },
    { name: "Mukesh Kumar", role: "bowl" },
    { name: "T. Natarajan", role: "bowl" },
    { name: "Lungi Ngidi", role: "bowl" },
    { name: "Ashutosh Sharma", role: "bat" },
    { name: "Tripurana Vijay", role: "bat" },
    { name: "Karun Nair", role: "bat" },
    { name: "Dushmantha Chameera", role: "bowl" },
    { name: "Auqib Nabi", role: "bowl" },
  ],
  PBKS: [
    { name: "Prabhsimran Singh", role: "wk" },
    { name: "Priyansh Arya", role: "bat" },
    { name: "Cooper Connolly", role: "all" },
    { name: "Shreyas Iyer", role: "bat" },
    { name: "Shashank Singh", role: "bat" },
    { name: "Nehal Wadhera", role: "bat" },
    { name: "Marcus Stoinis", role: "all" },
    { name: "Marco Jansen", role: "all" },
    { name: "Xavier Bartlett", role: "bowl" },
    { name: "Arshdeep Singh", role: "bowl" },
    { name: "Yuzvendra Chahal", role: "bowl" },
    { name: "Vyshak Vijaykumar", role: "bowl" },
    { name: "Harpreet Brar", role: "all" },
    { name: "Suryansh Shedge", role: "all" },
    { name: "Yash Thakur", role: "bowl" },
    { name: "Vishnu Vinod", role: "wk" },
  ],
  KKR: [
    { name: "Ajinkya Rahane", role: "bat" },
    { name: "Tim Seifert", role: "wk" },
    { name: "Cameron Green", role: "all" },
    { name: "Rovman Powell", role: "bat" },
    { name: "Rinku Singh", role: "bat" },
    { name: "Sunil Narine", role: "all" },
    { name: "Ramandeep Singh", role: "all" },
    { name: "Anukul Roy", role: "all" },
    { name: "Vaibhav Arora", role: "bowl" },
    { name: "Kartik Tyagi", role: "bowl" },
    { name: "Varun Chakaravarthy", role: "bowl" },
    { name: "Angkrish Raghuvanshi", role: "bat" },
    { name: "Manish Pandey", role: "bat" },
    { name: "Finn Allen", role: "bat" },
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

// Role-aware: full Player[] list for a team.
export function squadWithRolesForTeam(short: string | null | undefined): Player[] | null {
  if (!short) return null;
  return IPL_SQUADS_2026[short.toUpperCase()] || null;
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
