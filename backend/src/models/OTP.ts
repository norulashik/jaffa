import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface OTPAttributes {
  id: string;
  phone: string;
  code: string;
  expiresAt: Date;
  verified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface OTPCreationAttributes extends Optional<OTPAttributes, "id" | "verified"> {}

class OTP extends Model<OTPAttributes, OTPCreationAttributes> implements OTPAttributes {
  public id!: string;
  public phone!: string;
  public code!: string;
  public expiresAt!: Date;
  public verified!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OTP.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    sequelize,
    tableName: "otps",
    timestamps: true,
    indexes: [{ fields: ["phone", "code"] }],
  }
);

export default OTP;
