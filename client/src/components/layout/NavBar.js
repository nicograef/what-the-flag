// React and Redux
import React from "react";
import PropTypes from "prop-types";

// Material UI
import { AppBar, Toolbar, Typography } from "@mui/material";

// Components
import NavBarDashboard from "./navbars/NavBarDashboard";
import NavBarChallenge from "./navbars/NavBarChallenge";
import NavBarText from "./navbars/NavBarText";

const NavBar = ({ dashboard, challenge, ofTheWeek, text, questionCounter }) => {
  if (challenge)
    return (
      <NavBarChallenge
        ofTheWeek={ofTheWeek}
        text={text}
        questionCounter={questionCounter}
      />
    );
  if (dashboard) return <NavBarDashboard />;
  if (text && text.length > 0) return <NavBarText text={text} />;

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" style={{ flexGrow: 1 }}>
          What The Flag
        </Typography>
      </Toolbar>
    </AppBar>
  );
};

NavBar.propTypes = {
  dashboard: PropTypes.bool,
  challenge: PropTypes.bool,
  ofTheWeek: PropTypes.bool,
  text: PropTypes.string,
  questionCounter: PropTypes.string,
};

export default NavBar;
