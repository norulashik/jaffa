import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface MatchParticipantAttributes {
  id: string;
  userId: string;
  matchId: string;
  venueId: string;
  roomId?: string | null;
  totalPoints: number;
  round1Points: number;
  round2Points: number;
  round3Points: number;
  round4Points: number;
  round5Points: number;
  round6Points: number;
  currentStreak: number;
  bestStreak: number;
  boostsUsedRound: number; // boosts used in current round (1 allowed per phase/round)
  currentRound: number;
  allInUsed: boolean; // deprecated match-level flag, kept for backward compat
  allInUsedInnings1: boolean; // all-in used in innings 1 (rounds 1-3)
  allInUsedInnings2: boolean; // all-in used in innings 2 (rounds 4-6)
  totalPredictions: number;
  correctPredictions: number;
  joinedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MatchParticipantCreationAttributes extends Optional<MatchParticipantAttributes, "id" | "totalPoints" | "round1Points" | "round2Points" | "round3Points" | "round4Points" | "round5Points" | "round6Points" | "currentStreak" | "bestStreak" | "boostsUsedRound" | "currentRound" | "allInUsed" | "allInUsedInnings1" | "allInUsedInnings2" | "totalPredictions" | "correctPredictions" | "joinedAt"> {}

class MatchParticipant extends Model<MatchParticipantAttributes, MatchParticipantCreationAttributes> implements MatchParticipantAttributes {
  public id!: string;
  public userId!: string;
  public matchId!: string;
  public venueId!: string;
  public roomId!: string | null;
  public totalPoints!: number;
  public round1Points!: number;
  public round2Points!: number;
  public round3Points!: number;
  public round4Points!: number;
  public round5Points!: number;
  public round6Points!: number;
  public currentStreak!: number;
  public bestStreak!: number;
  public boostsUsedRound!: number;
  public currentRound!: number;
  public allInUsed!: boolean;
  public allInUsedInnings1!: boolean;
  public allInUsedInnings2!: boolean;
  public totalPredictions!: number;
  public correctPredictions!: number;
  public joinedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MatchParticipant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    matchId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "matches", key: "id" },
    },
    venueId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "venues", key: "id" },
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "rooms", key: "id" },
    },
    totalPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    round1Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    round2Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    round3Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    round4Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    round5Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    round6Points: { type: DataTypes.INTEGER, defaultValue: 0 },
    currentStreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    bestStreak: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    boostsUsedRound: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    currentRound: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    allInUsed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allInUsedInnings1: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    allInUsedInnings2: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    totalPredictions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    correctPredictions: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "match_participants",
    timestamps: true,
    indexes: [
      { fields: ["userId", "matchId", "venueId", "roomId"] },
      { fields: ["matchId", "venueId", "roomId", "totalPoints"] },
      { fields: ["matchId", "venueId", "round1Points"] },
      { fields: ["matchId", "venueId", "round2Points"] },
      { fields: ["matchId", "venueId", "round3Points"] },
      { fields: ["matchId", "venueId", "round4Points"] },
      { fields: ["matchId", "venueId", "round5Points"] },
      { fields: ["matchId", "venueId", "round6Points"] },
    ],
  }
);

export default MatchParticipant;
