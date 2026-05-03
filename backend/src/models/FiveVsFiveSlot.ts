import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type TeamSide = "team1" | "team2";

interface FiveVsFiveSlotAttributes {
  id: string;
  roomId: string;
  teamSide: TeamSide;       // "team1" / "team2" — bound to match.team1/team2
  role: number;             // 1..5 (Maestro/Igniter/Architect/Stormcaller/Hammer)
  userId: string;
  claimedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FiveVsFiveSlotCreationAttributes
  extends Optional<FiveVsFiveSlotAttributes, "id" | "claimedAt"> {}

class FiveVsFiveSlot
  extends Model<FiveVsFiveSlotAttributes, FiveVsFiveSlotCreationAttributes>
  implements FiveVsFiveSlotAttributes
{
  public id!: string;
  public roomId!: string;
  public teamSide!: TeamSide;
  public role!: number;
  public userId!: string;
  public claimedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

FiveVsFiveSlot.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    roomId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "five_vs_five_rooms", key: "id" },
    },
    teamSide: { type: DataTypes.STRING(10), allowNull: false },
    role: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    claimedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "five_vs_five_slots",
    timestamps: true,
    indexes: [
      // Exactly one user can claim a (room, team, role) tuple
      { fields: ["roomId", "teamSide", "role"], unique: true, name: "fivevsfive_slot_uq" },
      // One user can occupy at most one slot in a room
      { fields: ["roomId", "userId"], unique: true, name: "fivevsfive_user_uq" },
      { fields: ["userId"] },
    ],
  },
);

export default FiveVsFiveSlot;
