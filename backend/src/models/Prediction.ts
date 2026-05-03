import { DataTypes, Model, Optional, Op } from "sequelize";
import sequelize from "../config/database";

// "kong" — admin-fired ad-hoc question, owner-authored question + options +
// per-option points. Resolved manually via /owner/kong/:id/resolve. Rides
// the same scoring + socket pipeline as every other category.
export type PredictionCategory = "pre_match" | "per_over" | "hot_take" | "bold_call" | "rivalry_call" | "punter_card" | "kong";
export type PredictionStatus = "open" | "locked" | "resolved" | "voided";
// Live player-specific subjects. NULL for team-level / pre-match questions.
// - batsman_innings       → how many runs will this batsman score?
// - bowler_innings        → how many runs will this bowler concede? (runs bands)
// - bowler_innings_wkts   → how many wickets will this bowler take? (0/1/2/2+)
// - batsman_sixes         → how many sixes will this batsman hit tonight? (fires on first-six)
export type PredictionSubjectType =
  | "batsman_innings"
  | "bowler_innings"
  | "bowler_innings_wkts"
  | "batsman_sixes";

interface PredictionAttributes {
  id: string;
  matchId: string;
  category: PredictionCategory;
  round: number; // 1-4
  overNumber?: number; // for per-over questions
  question: string;
  options: { key: string; label: string; points: number }[];
  correctOption?: string;
  status: PredictionStatus;
  opensAt?: Date;
  expiresAt?: Date;
  // Live player tracking (null for team/pre-match questions)
  subjectType?: PredictionSubjectType | null;
  playerId?: number | null;
  inningsNumber?: number | null;
  voidedAt?: Date | null;
  voidReason?: string | null;
  // Stable identifier for team-level per-over templates so the resolver can
  // dispatch without substring-matching the (now-varied) question text.
  templateKey?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PredictionCreationAttributes
  extends Optional<
    PredictionAttributes,
    | "id"
    | "correctOption"
    | "status"
    | "overNumber"
    | "opensAt"
    | "expiresAt"
    | "subjectType"
    | "playerId"
    | "inningsNumber"
    | "voidedAt"
    | "voidReason"
  > {}

class Prediction extends Model<PredictionAttributes, PredictionCreationAttributes> implements PredictionAttributes {
  public id!: string;
  public matchId!: string;
  public category!: PredictionCategory;
  public round!: number;
  public overNumber!: number;
  public question!: string;
  public options!: { key: string; label: string; points: number }[];
  public correctOption!: string;
  public status!: PredictionStatus;
  public opensAt!: Date;
  public expiresAt!: Date;
  public subjectType!: PredictionSubjectType | null;
  public playerId!: number | null;
  public inningsNumber!: number | null;
  public voidedAt!: Date | null;
  public voidReason!: string | null;
  public templateKey!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Prediction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    matchId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "matches", key: "id" },
    },
    category: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    round: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 0, max: 6 }, // 0 = pre-match/rivalry, 1-6 = match rounds
    },
    overNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    options: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    correctOption: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(10),
      defaultValue: "open",
    },
    opensAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Live player-specific tracking. NULL for team-level/pre-match questions.
    subjectType: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    inningsNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    voidedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    voidReason: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    templateKey: {
      type: DataTypes.STRING(40),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "predictions",
    timestamps: true,
    indexes: [
      { fields: ["matchId", "round"] },
      { fields: ["matchId", "overNumber"] },
      { fields: ["matchId", "status"] },
      // One live-player question per (match, subject, player, innings).
      // Partial on subjectType IS NOT NULL keeps team-level questions unaffected.
      // SQLite supports partial indexes; Postgres does too.
      {
        fields: ["matchId", "subjectType", "playerId", "inningsNumber"],
        unique: true,
        where: { subjectType: { [Op.ne]: null } },
        name: "predictions_live_player_subject_uq",
      },
    ],
  }
);

export default Prediction;
