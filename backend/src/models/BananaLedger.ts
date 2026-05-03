import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

// Audit trail of every banana mutation. Every `awardBananas()` call writes a
// row here AND bumps User.bananas — if the two ever drift, this is the
// reconciliation source. Negative deltas record powerup purchases / refunds.

export type BananaReason =
  | "prediction_correct"        // +1 for any correct prediction
  | "punter_card_correct"       // +2 for a correct punter card pick
  | "streak_bonus_3"            // +2 on hitting streak == 3
  | "streak_bonus_5"            // +5 on hitting streak == 5
  | "streak_bonus_10"           // +10 on hitting streak == 10
  | "5v5_role_win"              // +5 for winning a 5v5 role matchup
  | "5v5_team_win"              // +10 for winning the 5v5 overall
  | "powerup_purchase"          // negative — buying a powerup
  | "powerup_refund"            // positive — refund (e.g. voided match)
  | "admin_grant";              // positive — manual grant via owner tool

interface BananaLedgerAttributes {
  id: string;
  userId: string;
  delta: number;            // +/- amount
  reason: BananaReason;
  refType: string | null;   // e.g. "prediction" / "powerup" / "5v5_room"
  refId: string | null;     // FK-style pointer to the source row
  createdAt?: Date;
  updatedAt?: Date;
}

interface BananaLedgerCreationAttributes
  extends Optional<BananaLedgerAttributes, "id" | "refType" | "refId"> {}

class BananaLedger
  extends Model<BananaLedgerAttributes, BananaLedgerCreationAttributes>
  implements BananaLedgerAttributes
{
  public id!: string;
  public userId!: string;
  public delta!: number;
  public reason!: BananaReason;
  public refType!: string | null;
  public refId!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

BananaLedger.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    delta: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(40), allowNull: false },
    refType: { type: DataTypes.STRING(40), allowNull: true },
    refId: { type: DataTypes.STRING(80), allowNull: true },
  },
  {
    sequelize,
    tableName: "banana_ledger",
    timestamps: true,
    indexes: [
      { fields: ["userId", "createdAt"] },
      { fields: ["reason"] },
      // Unique per (userId, reason, refId) so a retried scoring pass can't
      // double-credit. e.g. "prediction_correct/predX" is unique.
      { fields: ["userId", "reason", "refId"], unique: true, name: "banana_ledger_dedup_uq" },
    ],
  },
);

export default BananaLedger;
