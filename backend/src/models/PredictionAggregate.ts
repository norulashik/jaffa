import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type AggregateScope = "global" | "venue";
export const GLOBAL_SCOPE_ID = "GLOBAL";

interface PredictionAggregateAttributes {
  id: string;
  predictionId: string;
  scope: AggregateScope;
  scopeId: string;
  totalAnswered: number;
  correctCount: number;
  correctPct: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PredictionAggregateCreationAttributes
  extends Optional<PredictionAggregateAttributes, "id" | "createdAt" | "updatedAt"> {}

class PredictionAggregate
  extends Model<PredictionAggregateAttributes, PredictionAggregateCreationAttributes>
  implements PredictionAggregateAttributes
{
  public id!: string;
  public predictionId!: string;
  public scope!: AggregateScope;
  public scopeId!: string;
  public totalAnswered!: number;
  public correctCount!: number;
  public correctPct!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

PredictionAggregate.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    predictionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "predictions", key: "id" },
    },
    scope: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    scopeId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    totalAnswered: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    correctCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    correctPct: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: "prediction_aggregates",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["predictionId", "scope", "scopeId"] },
      { fields: ["predictionId"] },
    ],
  }
);

export default PredictionAggregate;
