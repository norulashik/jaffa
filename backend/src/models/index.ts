import sequelize from "../config/database";
import User from "./User";
import Venue from "./Venue";
import Match from "./Match";
import Prediction from "./Prediction";
import UserPrediction from "./UserPrediction";
import MatchParticipant from "./MatchParticipant";
import Reward from "./Reward";
import OTP from "./OTP";

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

// Prediction has many UserPredictions
Prediction.hasMany(UserPrediction, { foreignKey: "predictionId", as: "userPredictions" });
UserPrediction.belongsTo(Prediction, { foreignKey: "predictionId", as: "prediction" });

export {
  sequelize,
  User,
  Venue,
  Match,
  Prediction,
  UserPrediction,
  MatchParticipant,
  Reward,
  OTP,
};
