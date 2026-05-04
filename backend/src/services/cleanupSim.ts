// One-time-on-boot vacuum for the orphaned simulation match data left over
// from the deleted simulation feature.
//
// History: an earlier task code-removed the entire simulation feature
// (services/simulationRunner.ts, data/simulationScript.ts, /owner/sim/*
// routes, the Sim tab in the owner page). The DB row for the synthetic
// match (externalId="sim:demo-1", team shorts SIM1/SIM2) was never
// dropped — the original plan called that out as "out of scope, admin
// can drop it via SQL". On prod the Match row is still flagged
// status="live" and surfaces in the Owner Matches list + the Punter
// Card Admin dropdown.
//
// This module deletes those leftovers automatically at server boot.
// Idempotent: a second boot with nothing to clean is a silent no-op.

import { Op } from "sequelize";
import {
  sequelize,
  Match,
  Prediction,
  UserPrediction,
  MatchParticipant,
  MatchCode,
  Reward,
  Room,
  RoomMember,
  FiveVsFiveRoom,
  FiveVsFiveSlot,
} from "../models";

export interface PurgeResult {
  matchesPurged: number;
  predictionsPurged: number;
  userPredictionsPurged: number;
}

// Detection signals (OR'd together so a row missing one is still caught
// by the other):
//   1. externalId LIKE 'sim:%' — the canonical tag we set when the
//      simulation runner was alive.
//   2. team1Short='SIM1' AND team2Short='SIM2' — fallback for any rows
//      whose externalId got nulled out somewhere along the way.
async function findSimulationMatches(): Promise<Match[]> {
  return Match.findAll({
    where: {
      [Op.or]: [
        { externalId: { [Op.like]: "sim:%" } },
        { [Op.and]: [{ team1Short: "SIM1" }, { team2Short: "SIM2" }] },
      ],
    } as any,
  });
}

export async function purgeSimulationData(): Promise<PurgeResult> {
  const result: PurgeResult = {
    matchesPurged: 0,
    predictionsPurged: 0,
    userPredictionsPurged: 0,
  };

  let sims: Match[];
  try {
    sims = await findSimulationMatches();
  } catch (err) {
    // On a brand-new DB the matches table might not exist yet (Sequelize
    // sync hasn't run). The caller (index.ts) calls us AFTER sync, but
    // be defensive — log + bail rather than crash boot.
    console.warn("[CleanupSim] could not query matches table:", err);
    return result;
  }
  if (sims.length === 0) return result;

  for (const sim of sims) {
    // Per-match transaction so a partial failure on one sim row doesn't
    // half-delete and leave FK orphans. If anything throws inside, the
    // whole sim's cascade rolls back; we log + move on.
    try {
      await sequelize.transaction(async (t) => {
        const matchId = sim.id;

        // 1. UserPredictions — count first so the log line is informative.
        const upsCount = await UserPrediction.count({
          where: { matchId },
          transaction: t,
        });
        await UserPrediction.destroy({ where: { matchId }, transaction: t });

        // 2. Predictions
        const predCount = await Prediction.count({
          where: { matchId },
          transaction: t,
        });
        await Prediction.destroy({ where: { matchId }, transaction: t });

        // 3. MatchParticipants
        await MatchParticipant.destroy({ where: { matchId }, transaction: t });

        // 4. MatchCodes (venue-issued 4-digit codes for joining)
        await MatchCode.destroy({ where: { matchId }, transaction: t });

        // 5. Rewards (none should exist, but defensive)
        await Reward.destroy({ where: { matchId }, transaction: t });

        // 6+7. 5v5 — slots reference rooms which reference match. Slots
        // first, then rooms.
        const fiveRooms = await FiveVsFiveRoom.findAll({
          where: { matchId },
          attributes: ["id"],
          transaction: t,
        });
        if (fiveRooms.length > 0) {
          const fiveRoomIds = fiveRooms.map((r) => r.id);
          await FiveVsFiveSlot.destroy({
            where: { roomId: { [Op.in]: fiveRoomIds } },
            transaction: t,
          });
          await FiveVsFiveRoom.destroy({
            where: { id: { [Op.in]: fiveRoomIds } },
            transaction: t,
          });
        }

        // 8+9. Rooms (regular season/friendly) — members first, then rooms.
        const rooms = await Room.findAll({
          where: { matchId },
          attributes: ["id"],
          transaction: t,
        });
        if (rooms.length > 0) {
          const roomIds = rooms.map((r) => r.id);
          await RoomMember.destroy({
            where: { roomId: { [Op.in]: roomIds } },
            transaction: t,
          });
          await Room.destroy({
            where: { id: { [Op.in]: roomIds } },
            transaction: t,
          });
        }

        // 10. The Match row itself.
        await sim.destroy({ transaction: t });

        result.matchesPurged += 1;
        result.predictionsPurged += predCount;
        result.userPredictionsPurged += upsCount;
        console.log(
          `[CleanupSim] purged match ${matchId} (externalId=${sim.externalId ?? "<null>"}, ${predCount} preds, ${upsCount} picks)`,
        );
      });
    } catch (err) {
      // One sim's cascade failed — keep going for the others. We'd rather
      // clean N-1 of N than crash boot and leave all of them.
      console.error(`[CleanupSim] failed to purge sim match ${sim.id}:`, err);
    }
  }

  return result;
}
