import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type PredictionCategory = "pre_match" | "per_over" | "hot_take" | "bold_call" | "rivalry_call";
export type PredictionStatus = "open" | "locked" | "resolved";

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
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PredictionCreationAttributes extends Optional<PredictionAttributes, "id" | "correctOption" | "status" | "overNumber" | "expiresAt"> {}

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
  public expiresAt!: Date;
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
      validate: { min: 0, max: 4 }, // 0 = pre-match
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
    expiresAt: {
      type: DataTypes.DATE,
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
    ],
  }
);

export default Prediction;
