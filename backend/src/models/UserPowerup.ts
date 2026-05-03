import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// One row per powerup purchase. Lifecycle: owned → active → consumed.
// Permanent powerups (Silverback) stay status="owned" forever and are
// detected via powerupKey alone in scoring paths.

export type PowerupStatus = "owned" | "active" | "consumed";
export type PowerupKey =
  | "gorilla_guard"
  | "chimp_tank"
  | "banana_berserk"
  | "silverback_clutch"
  | "monke_mayhem";

interface UserPowerupAttributes {
  id: string;
  userId: string;
  powerupKey: PowerupKey;
  status: PowerupStatus;
  matchId: string | null;            // null for owned-not-activated and Silverback
  chargesRemaining: number | null;   // Guard=2 / Tank=3 at activate; null for others
  metadata: Record<string, unknown> | null;
  // e.g. Berserk: { berserkMultiplier: 4, overNumber: 7 }
  // Tank: { lastUsedDate: "2026-05-04" }
  purchasedAt: Date;
  activatedAt: Date | null;
  consumedAt: Date | null;
  // Year+week encoded number at purchase time, used for weekly cap accounting
  // without needing to recompute per request.
  purchaseWeekNumber: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserPowerupCreationAttributes
  extends Optional<
    UserPowerupAttributes,
    | "id"
    | "status"
    | "matchId"
    | "chargesRemaining"
    | "metadata"
    | "activatedAt"
    | "consumedAt"
    | "purchasedAt"
  > {}

class UserPowerup
  extends Model<UserPowerupAttributes, UserPowerupCreationAttributes>
  implements UserPowerupAttributes
{
  public id!: string;
  public userId!: string;
  public powerupKey!: PowerupKey;
  public status!: PowerupStatus;
  public matchId!: string | null;
  public chargesRemaining!: number | null;
  public metadata!: Record<string, unknown> | null;
  public purchasedAt!: Date;
  public activatedAt!: Date | null;
  public consumedAt!: Date | null;
  public purchaseWeekNumber!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserPowerup.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    powerupKey: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.STRING(20), defaultValue: "owned" },
    matchId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "matches", key: "id" },
    },
    chargesRemaining: { type: DataTypes.INTEGER, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    purchasedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    activatedAt: { type: DataTypes.DATE, allowNull: true },
    consumedAt: { type: DataTypes.DATE, allowNull: true },
    purchaseWeekNumber: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    tableName: "user_powerups",
    timestamps: true,
    indexes: [
      { fields: ["userId", "status"] },
      { fields: ["userId", "powerupKey", "status"] },
      { fields: ["userId", "matchId", "status"] },
    ],
  },
);

export default UserPowerup;
