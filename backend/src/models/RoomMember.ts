import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface RoomMemberAttributes {
  id: string;
  roomId: string;
  userId: string;
  joinedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface RoomMemberCreationAttributes
  extends Optional<RoomMemberAttributes, "id" | "joinedAt"> {}

class RoomMember
  extends Model<RoomMemberAttributes, RoomMemberCreationAttributes>
  implements RoomMemberAttributes
{
  public id!: string;
  public roomId!: string;
  public userId!: string;
  public joinedAt!: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

RoomMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roomId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "rooms", key: "id" },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
    joinedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "room_members",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["roomId", "userId"] },
      { fields: ["userId"] },
    ],
  }
);

export default RoomMember;
