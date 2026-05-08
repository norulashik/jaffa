// Universal room-code resolver. Both 5v5 rooms and friend/season rooms use
// the same 6-char A-Z2-9 code format but live in different tables, so the
// frontend has to probe each type. We try 5v5 first (shorter-lived rooms,
// smaller pool) and fall back to /rooms/join — if neither matches we throw
// "Code not found" for the caller to surface.
//
// 409 (already in room) is treated as a soft-success: backend returns the
// existing roomId so we route the user there instead of erroring.

import { api } from "./api";
import { fiveVsFiveApi, type FiveVsFiveRoomDto } from "./fiveVsFiveApi";

export type ResolvedRoom =
  | { kind: "5v5"; roomId: string; alreadyJoined: boolean; room?: FiveVsFiveRoomDto }
  | { kind: "room"; roomId: string; alreadyJoined: boolean; room: any; venueId: string };

export async function resolveAndJoinAnyRoom(rawCode: string): Promise<ResolvedRoom> {
  const code = rawCode.trim().toUpperCase();
  if (code.length !== 6) {
    throw new Error("Enter a 6-character code");
  }

  // Try 5v5 first.
  try {
    const room = await fiveVsFiveApi.joinByCode(code);
    return { kind: "5v5", roomId: room.id, alreadyJoined: false, room };
  } catch (err: any) {
    // Already in another 5v5 for this match — backend hands back the
    // existing roomId so we can deep-link there.
    if (err?.status === 409 && err?.body?.roomId) {
      return { kind: "5v5", roomId: err.body.roomId, alreadyJoined: true };
    }
    // 404 = not a 5v5 code, fall through to the regular-room lookup.
    if (err?.status !== 404) {
      throw err;
    }
  }

  // Try friend/season room. The backend short-circuits already-members
  // with a 200 + `message: "Already a member of this room"`, so the success
  // path covers the rejoin case — no 409 to special-case here.
  try {
    const resp: any = await api.joinRoomByCode(code);
    const alreadyJoined = typeof resp?.message === "string" && resp.message.toLowerCase().includes("already");
    return { kind: "room", roomId: resp.room.id, alreadyJoined, room: resp.room, venueId: resp.venueId };
  } catch (err: any) {
    if (err?.status === 404) {
      throw new Error("Code not found. Check the 6 characters and try again.");
    }
    throw err;
  }
}
