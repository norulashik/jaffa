import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";

export type SquadRole = "bat" | "wk" | "all" | "bowl";
// "match"  = derived from a completed match's ball-by-ball feed (squadSync.ts).
// "manual" = admin/CLI-authored override.
// "smonks" = nightly pull of the team's official squad list from Sportmonks
//            (sportsmonkSquadSync.ts). Treated as authoritative for canonical
//            spelling; "manual" rows are never overwritten by it.
export type SquadSource = "match" | "manual" | "smonks";

interface SquadOverrideAttributes {
  id: string;
  team: string;            // uppercased team short ("CSK", "MI", ...)
  playerName: string;      // canonical name as written by Sportsmonk
  role: SquadRole;
  source: SquadSource;     // "match" = auto-synced; "manual" = admin override
  // Optional pointer to the squad-side spelling (from iplSquads.ts) that
  // this override merged into. Set when syncSquadFromMatch fuzzy-matches a
  // ball-feed fullname to an existing static-squad name. resolveBallName
  // reads this column to resolve squad-side names → ball-feed names without
  // re-running the fuzzy matcher every match. Null when the override was
  // a brand-new player no static-squad entry covered.
  canonicalName: string | null;
  addedFromMatchId: string | null;
  lastSeenAt: Date;        // bumped each time the player features in a match
  removedAt: Date | null;  // soft-delete: null = active
  createdAt?: Date;
  updatedAt?: Date;
}

interface SquadOverrideCreationAttributes
  extends Optional<SquadOverrideAttributes, "id" | "addedFromMatchId" | "lastSeenAt" | "removedAt" | "source" | "canonicalName"> {}

class SquadOverride
  extends Model<SquadOverrideAttributes, SquadOverrideCreationAttributes>
  implements SquadOverrideAttributes
{
  public id!: string;
  public team!: string;
  public playerName!: string;
  public role!: SquadRole;
  public source!: SquadSource;
  public canonicalName!: string | null;
  public addedFromMatchId!: string | null;
  public lastSeenAt!: Date;
  public removedAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SquadOverride.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    team: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    playerName: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "match",
    },
    canonicalName: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    addedFromMatchId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    lastSeenAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    removedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "squad_overrides",
    timestamps: true,
    indexes: [
      // (team, lower(playerName)) is the natural key — re-syncing the same
      // player from a later match should UPDATE, not duplicate. We can't
      // express the lower() in a Sequelize index portably, so the
      // squadSync.ts service does case-insensitive lookup before insert.
      { fields: ["team"] },
      { fields: ["team", "playerName"] },
      { fields: ["lastSeenAt"] },
    ],
  }
);

export default SquadOverride;
