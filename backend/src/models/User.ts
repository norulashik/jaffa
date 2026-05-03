import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

interface UserAttributes {
  id: string;
  phone: string;
  displayName: string;
  avatarConfig: string | null;
  weeklyPoints: number;
  weekNumber: number;
  lifetimePoints: number;
  city: string | null;
  state: string | null;
  // Soft-currency awarded by 5v5 wins. 5 per role-vs-role win + 10 to each
  // member of the overall winning team. Stored on User so it persists across
  // matches; surfaced on the profile page between Lifetime + Location.
  bananas: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserCreationAttributes extends Optional<UserAttributes, "id" | "avatarConfig" | "weeklyPoints" | "weekNumber" | "lifetimePoints" | "city" | "state" | "bananas"> {}

class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public phone!: string;
  public displayName!: string;
  public avatarConfig!: string | null;
  public weeklyPoints!: number;
  public weekNumber!: number;
  public lifetimePoints!: number;
  public city!: string | null;
  public state!: string | null;
  public bananas!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone: {
      type: DataTypes.STRING(15),
      allowNull: false,
      unique: true,
    },
    displayName: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    avatarConfig: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    weeklyPoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    weekNumber: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lifetimePoints: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
    },
    bananas: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
  }
);

export default User;
