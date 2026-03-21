import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type RewardStatus = "active" | "redeemed" | "expired";

interface RewardAttributes {
  id: string;
  userId: string;
  matchId: string;
  venueId: string;
  round: number; // 0 = grand prize, 1-4 = round prize
  position: number; // 1, 2, or 3
  rewardText: string;
  code: string; // 4-digit code
  status: RewardStatus;
  expiresAt: Date;
  redeemedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RewardCreationAttributes extends Optional<RewardAttributes, "id" | "status" | "redeemedAt"> {}

class Reward extends Model<RewardAttributes, RewardCreationAttributes> implements RewardAttributes {
  public id!: string;
  public userId!: string;
  public matchId!: string;
  public venueId!: string;
  public round!: number;
  public position!: number;
  public rewardText!: string;
  public code!: string;
  public status!: RewardStatus;
  public expiresAt!: Date;
  public redeemedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Reward.init(
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
    round: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 3 },
    },
    rewardText: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(4),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(10),
      defaultValue: "active",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    redeemedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "rewards",
    timestamps: true,
    indexes: [
      { fields: ["venueId", "matchId", "status"] },
      { fields: ["code", "venueId"] },
      { fields: ["userId"] },
    ],
  }
);

export default Reward;
