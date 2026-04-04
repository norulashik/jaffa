import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface MatchCodeAttributes {
  id: string;
  venueId: string;
  matchId: string;
  code: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MatchCodeCreationAttributes extends Optional<MatchCodeAttributes, "id" | "isActive"> {}

class MatchCode extends Model<MatchCodeAttributes, MatchCodeCreationAttributes> implements MatchCodeAttributes {
  public id!: string;
  public venueId!: string;
  public matchId!: string;
  public code!: string;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

MatchCode.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    venueId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    matchId: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(4),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "match_codes",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["venueId", "matchId", "isActive"] },
    ],
  }
);

export default MatchCode;
