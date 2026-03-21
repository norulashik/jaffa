import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type MatchStatus = "upcoming" | "live" | "completed";
export type InningsPhase = "pre_match" | "innings1_powerplay" | "innings1_middle" | "innings1_death" | "innings_break" | "innings2_powerplay" | "innings2_middle" | "innings2_death" | "completed";

interface MatchAttributes {
  id: string;
  externalId?: string;
  team1: string;
  team2: string;
  team1Short: string;
  team2Short: string;
  team1Players: string[];
  team2Players: string[];
  startTime: Date;
  status: MatchStatus;
  currentPhase: InningsPhase;
  currentOver: number;
  currentInnings: number;
  scoreData: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface MatchCreationAttributes extends Optional<MatchAttributes, "id" | "externalId" | "status" | "currentPhase" | "currentOver" | "currentInnings" | "scoreData" | "team1Players" | "team2Players"> {}

class Match extends Model<MatchAttributes, MatchCreationAttributes> implements MatchAttributes {
  public id!: string;
  public externalId!: string;
  public team1!: string;
  public team2!: string;
  public team1Short!: string;
  public team2Short!: string;
  public team1Players!: string[];
  public team2Players!: string[];
  public startTime!: Date;
  public status!: MatchStatus;
  public currentPhase!: InningsPhase;
  public currentOver!: number;
  public currentInnings!: number;
  public scoreData!: Record<string, unknown>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Match.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    externalId: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    team1: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    team2: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    team1Short: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    team2Short: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    team1Players: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    team2Players: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: "upcoming",
    },
    currentPhase: {
      type: DataTypes.STRING(30),
      defaultValue: "pre_match",
    },
    currentOver: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    currentInnings: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    scoreData: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  },
  {
    sequelize,
    tableName: "matches",
    timestamps: true,
  }
);

export default Match;
