import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface WeeklyRedemptionAttributes {
  id: string;
  userId: string;
  rewardKey: string;
  rewardName: string;
  pointsSpent: number;
  weekNumber: number;
  redeemedAt: Date;
}

interface WeeklyRedemptionCreationAttributes
  extends Optional<WeeklyRedemptionAttributes, "id" | "redeemedAt"> {}

class WeeklyRedemption
  extends Model<WeeklyRedemptionAttributes, WeeklyRedemptionCreationAttributes>
  implements WeeklyRedemptionAttributes
{
  public id!: string;
  public userId!: string;
  public rewardKey!: string;
  public rewardName!: string;
  public pointsSpent!: number;
  public weekNumber!: number;
  public redeemedAt!: Date;
}

WeeklyRedemption.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    rewardKey: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    rewardName: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    pointsSpent: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    weekNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    redeemedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "weekly_redemptions",
    timestamps: true,
    indexes: [{ fields: ["userId", "weekNumber"] }],
  }
);

export default WeeklyRedemption;
