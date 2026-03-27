import { createBrowserRouter } from "react-router";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import LobbyPage from "./pages/LobbyPage";
import MatchPage from "./pages/MatchPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import RewardsPage from "./pages/RewardsPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPage from "./pages/AdminPage";
import TVDisplayPage from "./pages/TVDisplayPage";
import NotFoundPage from "./pages/NotFoundPage";
import CafeLandingPage from "./pages/cafe/CafeLandingPage";
import CafeLobbyPage from "./pages/cafe/CafeLobbyPage";
import CafeMatchPage from "./pages/cafe/CafeMatchPage";
import CafeLeaderboardPage from "./pages/cafe/CafeLeaderboardPage";
import CafeRewardsPage from "./pages/cafe/CafeRewardsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: LandingPage,
  },
  {
    path: "/login",
    Component: LoginPage,
  },
  {
    path: "/lobby",
    Component: LobbyPage,
  },
  {
    path: "/match/:matchId",
    Component: MatchPage,
  },
  {
    path: "/leaderboard",
    Component: LeaderboardPage,
  },
  {
    path: "/rewards",
    Component: RewardsPage,
  },
  {
    path: "/profile",
    Component: ProfilePage,
  },
  {
    path: "/admin",
    Component: AdminPage,
  },
  {
    path: "/tv",
    Component: TVDisplayPage,
  },
  {
    path: "/cafe/:slug",
    Component: CafeLandingPage,
  },
  {
    path: "/cafe/:slug/lobby",
    Component: CafeLobbyPage,
  },
  {
    path: "/cafe/:slug/match/:matchId",
    Component: CafeMatchPage,
  },
  {
    path: "/cafe/:slug/leaderboard",
    Component: CafeLeaderboardPage,
  },
  {
    path: "/cafe/:slug/rewards",
    Component: CafeRewardsPage,
  },
  {
    path: "*",
    Component: NotFoundPage,
  },
]);
