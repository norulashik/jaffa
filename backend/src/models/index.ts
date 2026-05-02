import sequelize from "../config/database";
import User from "./User";
import Venue from "./Venue";
import Match from "./Match";
import Prediction from "./Prediction";
import UserPrediction from "./UserPrediction";
import MatchParticipant from "./MatchParticipant";
import Reward from "./Reward";
import MatchCode from "./MatchCode";
import OTP from "./OTP";
import Room from "./Room";
import RoomMember from "./RoomMember";
import WeeklyRedemption from "./WeeklyRedemption";
import PredictionAggregate from "./PredictionAggregate";
import SquadOverride from "./SquadOverride";

// Associations

// User has many MatchParticipants
User.hasMany(MatchParticipant, { foreignKey: "userId", as: "participations" });
MatchParticipant.belongsTo(User, { foreignKey: "userId", as: "user" });

// User has many UserPredictions
User.hasMany(UserPrediction, { foreignKey: "userId", as: "predictions" });
UserPrediction.belongsTo(User, { foreignKey: "userId", as: "user" });

// User has many Rewards
User.hasMany(Reward, { foreignKey: "userId", as: "rewards" });
Reward.belongsTo(User, { foreignKey: "userId", as: "user" });

// Match has many Predictions
Match.hasMany(Prediction, { foreignKey: "matchId", as: "predictions" });
Prediction.belongsTo(Match, { foreignKey: "matchId", as: "match" });

// Match has many MatchParticipants
Match.hasMany(MatchParticipant, { foreignKey: "matchId", as: "participants" });
MatchParticipant.belongsTo(Match, { foreignKey: "matchId", as: "match" });

// Venue has many MatchParticipants
Venue.hasMany(MatchParticipant, { foreignKey: "venueId", as: "participants" });
MatchParticipant.belongsTo(Venue, { foreignKey: "venueId", as: "venue" });

// Venue has many Rewards
Venue.hasMany(Reward, { foreignKey: "venueId", as: "rewards" });
Reward.belongsTo(Venue, { foreignKey: "venueId", as: "venue" });

// Venue has many MatchCodes
Venue.hasMany(MatchCode, { foreignKey: "venueId", as: "matchCodes" });
MatchCode.belongsTo(Venue, { foreignKey: "venueId", as: "venue" });

// Prediction has many UserPredictions
Prediction.hasMany(UserPrediction, { foreignKey: "predictionId", as: "userPredictions" });
UserPrediction.belongsTo(Prediction, { foreignKey: "predictionId", as: "prediction" });

// Prediction has many PredictionAggregates (one per scope)
Prediction.hasMany(PredictionAggregate, { foreignKey: "predictionId", as: "aggregates" });
PredictionAggregate.belongsTo(Prediction, { foreignKey: "predictionId", as: "prediction" });

// Room associations
User.hasMany(Room, { foreignKey: "hostUserId", as: "hostedRooms" });
Room.belongsTo(User, { foreignKey: "hostUserId", as: "host" });

Match.hasMany(Room, { foreignKey: "matchId", as: "rooms" });
Room.belongsTo(Match, { foreignKey: "matchId", as: "match" });

Room.hasMany(RoomMember, { foreignKey: "roomId", as: "members" });
RoomMember.belongsTo(Room, { foreignKey: "roomId", as: "room" });

User.hasMany(RoomMember, { foreignKey: "userId", as: "roomMemberships" });
RoomMember.belongsTo(User, { foreignKey: "userId", as: "user" });

// Weekly redemptions
User.hasMany(WeeklyRedemption, { foreignKey: "userId", as: "weeklyRedemptions" });
WeeklyRedemption.belongsTo(User, { foreignKey: "userId", as: "user" });

export {
  sequelize,
  User,
  Venue,
  Match,
  Prediction,
  UserPrediction,
  MatchParticipant,
  Reward,
  MatchCode,
  OTP,
  Room,
  RoomMember,
  WeeklyRedemption,
  PredictionAggregate,
  SquadOverride,
};
