import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface VenueAttributes {
  id: string;
  name: string;
  ownerPhone: string;
  ownerName: string;
  password: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  logoUrl?: string;
  rewardConfig: {
    roundReward: { top1: string; top2: string; top3: string };
    grandPrize: { top1: string; top2: string; top3: string };
  };
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface VenueCreationAttributes extends Optional<VenueAttributes, "id" | "logoUrl" | "isActive" | "radiusMeters"> {}

class Venue extends Model<VenueAttributes, VenueCreationAttributes> implements VenueAttributes {
  public id!: string;
  public name!: string;
  public ownerPhone!: string;
  public ownerName!: string;
  public password!: string;
  public latitude!: number;
  public longitude!: number;
  public radiusMeters!: number;
  public logoUrl!: string;
  public rewardConfig!: VenueAttributes["rewardConfig"];
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Venue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    ownerPhone: {
      type: DataTypes.STRING(15),
      allowNull: false,
    },
    ownerName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    radiusMeters: {
      type: DataTypes.INTEGER,
      defaultValue: 200,
    },
    logoUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    rewardConfig: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        roundReward: {
          top1: "Free drink",
          top2: "20% off next order",
          top3: "10% off next order",
        },
        grandPrize: {
          top1: "Free meal up to ₹500",
          top2: "Free starter + drink",
          top3: "25% off total bill",
        },
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "venues",
    timestamps: true,
  }
);

export default Venue;
