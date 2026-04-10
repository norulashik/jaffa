import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface RoomAttributes {
  id: string;
  name: string;
  hostUserId: string;
  matchId: string;
  code: string;
  isPublic: boolean;
  maxPlayers: number;
  status: "waiting" | "active" | "closed";
  createdAt?: Date;
  updatedAt?: Date;
}

interface RoomCreationAttributes
  extends Optional<RoomAttributes, "id" | "isPublic" | "maxPlayers" | "status"> {}

class Room
  extends Model<RoomAttributes, RoomCreationAttributes>
  implements RoomAttributes
{
  public id!: string;
  public name!: string;
  public hostUserId!: string;
  public matchId!: string;
  public code!: string;
  public isPublic!: boolean;
  public maxPlayers!: number;
  public status!: "waiting" | "active" | "closed";
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Room.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    hostUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    matchId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "matches", key: "id" },
    },
    code: {
      type: DataTypes.STRING(6),
      allowNull: false,
      unique: true,
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    maxPlayers: {
      type: DataTypes.INTEGER,
      defaultValue: 10,
    },
    status: {
      type: DataTypes.STRING(10),
      defaultValue: "waiting",
    },
  },
  {
    sequelize,
    tableName: "rooms",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["code"] },
      { fields: ["matchId", "isPublic", "status"] },
      { fields: ["hostUserId"] },
    ],
  }
);

export default Room;
