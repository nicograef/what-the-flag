// React and Redux
import React, { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { connect } from "react-redux";

// Actions
import { loadUser } from "./actions/auth";

// Components
import PrivateRoute from "./components/routing/PrivateRout";
import SplashScreen from "./components/layout/SplashScreen";
import Login from "./pages/Login";
import Register from "./pages/Register";

// Pages
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard";
import Challenge from "./pages/Challenge";
import ChallengeResult from "./pages/ChallengeResult";
import Leaderboard from "./pages/Leaderboard";
import ChallengeOfTheWeek from "./pages/ChallengeOfTheWeek";
import ChallengeOfTheWeekLeaderboard from "./pages/ChallengeOfTheWeekLeaderboard";

// Fonts
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";

// Custom CSS
import "./App.css";

function App({ loadUser }) {
  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route exact path="/" element={<SplashScreen />} />

        <Route
          exact
          path="/profile"
          element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/challenge"
          element={
            <PrivateRoute>
              <Challenge />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/challenge-result"
          element={
            <PrivateRoute>
              <ChallengeResult />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/leaderboard"
          element={
            <PrivateRoute>
              <Leaderboard />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/challengeoftheweek"
          element={
            <PrivateRoute>
              <ChallengeOfTheWeek />
            </PrivateRoute>
          }
        />
        <Route
          exact
          path="/challengeoftheweek-leaderboard"
          element={
            <PrivateRoute>
              <ChallengeOfTheWeekLeaderboard />
            </PrivateRoute>
          }
        />

        <Route exact path="/login" element={<Login />} />
        <Route exact path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default connect(null, { loadUser })(App);
