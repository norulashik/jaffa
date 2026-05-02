import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type BoostType = "boost" | "all_in" | "none";

interface UserPredictionAttributes {
  id: string;
  userId: string;
  predictionId: string;
  matchId: string;
  venueId: string;
  selectedOption: string;
  boostType: BoostType;
  pointsEarned: number;
  isCorrect?: boolean;
  feedbackText?: string | null;
  answeredAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserPredictionCreationAttributes
  extends Optional<UserPredictionAttributes, "id" | "pointsEarned" | "isCorrect" | "feedbackText" | "answeredAt"> {}

class UserPrediction extends Model<UserPredictionAttributes, UserPredictionCreationAttributes> implements UserPredictionAttributes {
  public id!: string;
  public userId!: string;
  public predictionId!: string;
  public matchId!: string;
  public venueId!: string;
  public selectedOption!: string;
  public boostType!: BoostType;
  public pointsEarned!: number;
  public isCorrect!: boolean;
  public feedbackText!: string | null;
  public answeredAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

UserPrediction.init(
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
    predictionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "predictions", key: "id" },
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
    selectedOption: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    boostType: {
      type: DataTypes.STRING(10),
      defaultValue: "none",
    },
    pointsEarned: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    isCorrect: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },
    feedbackText: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    answeredAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "user_predictions",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["userId", "predictionId"] }, // one answer per prediction per user
      { fields: ["matchId", "venueId", "userId"] },
      { fields: ["predictionId"] },
    ],
  }
);

export default UserPrediction;
