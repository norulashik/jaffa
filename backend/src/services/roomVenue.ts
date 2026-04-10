import Venue from "../models/Venue";

export const ROOM_VENUE_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureRoomVenue(): Promise<void> {
  await Venue.findOrCreate({
    where: { id: ROOM_VENUE_ID },
    defaults: {
      id: ROOM_VENUE_ID,
      name: "JAFFA Rooms",
      slug: "__rooms__",
      ownerPhone: "0000000000",
      ownerName: "System",
      password: "not-a-real-password",
      latitude: 0,
      longitude: 0,
      radiusMeters: 999999,
      rewardConfig: {
        roundReward: { top1: "", top2: "", top3: "" },
        grandPrize: { top1: "", top2: "", top3: "" },
      },
      approvalStatus: "approved",
      isActive: true,
    } as any,
  });
  console.log("Room venue ensured (ROOM_VENUE_ID:", ROOM_VENUE_ID, ")");
}
