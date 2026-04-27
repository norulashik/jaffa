// Default venue ID for global (non-cafe) users.
//
// JAFFA's data model requires every MatchParticipant + UserPrediction to
// be scoped to a venueId. Cafe users get a real venue from the QR-code
// onboarding flow; users who arrive via the marketing site / shared link
// have no cafe context, so the backend pre-creates a single synthetic
// "JAFFA Rooms" venue and routes their picks through it. The id below
// matches `ROOM_VENUE_ID` in `backend/src/services/roomVenue.ts` — keep
// the two in sync if either ever changes.
//
// Use this as a fallback whenever a frontend page needs a venueId and
// none was provided via URL / localStorage / GameContext.
export const GLOBAL_VENUE_ID = "00000000-0000-0000-0000-000000000001";
