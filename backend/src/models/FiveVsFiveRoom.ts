import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type FiveVsFiveStatus = "waiting" | "active" | "completed" | "voided";

interface FiveVsFiveRoomAttributes {
  id: string;
  matchId: string;
  code: string;          // 6-char join code (excludes 0/O/I/L for legibility)
  hostUserId: string;
  status: FiveVsFiveStatus;
  startedAt: Date | null;   // when host clicked Start
  settledAt: Date | null;   // when resolution finished
  // Cached settlement payload — keeps the results page snappy without
  // re-walking ball data on every visit. Populated by resolve5v5Match.
  resultSummary: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FiveVsFiveRoomCreationAttributes
  extends Optional<
    FiveVsFiveRoomAttributes,
    "id" | "status" | "startedAt" | "settledAt" | "resultSummary"
  > {}

class FiveVsFiveRoom
  extends Model<FiveVsFiveRoomAttributes, FiveVsFiveRoomCreationAttributes>
  implements FiveVsFiveRoomAttributes
{
  public id!: string;
  public matchId!: string;
  public code!: string;
  public hostUserId!: string;
  public status!: FiveVsFiveStatus;
  public startedAt!: Date | null;
  public settledAt!: Date | null;
  public resultSummary!: Record<string, unknown> | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

FiveVsFiveRoom.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    matchId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "matches", key: "id" },
    },
    code: { type: DataTypes.STRING(6), allowNull: false, unique: true },
    hostUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    status: { type: DataTypes.STRING(20), defaultValue: "waiting" },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    resultSummary: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    tableName: "five_vs_five_rooms",
    timestamps: true,
    indexes: [
      { fields: ["matchId"] },
      { fields: ["status"] },
    ],
  },
);

export default FiveVsFiveRoom;
