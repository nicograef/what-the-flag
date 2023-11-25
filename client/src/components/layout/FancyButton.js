// React and Redux
import React from "react";

// Material UI
import { Button } from "@mui/material";
import { makeStyles } from "@mui/styles";

const FancyButton = ({ children, ...rest }) => {
  const { fancyButton } = useStyles();

  return (
    <Button className={fancyButton} fullWidth variant="contained" {...rest}>
      {children}
    </Button>
  );
};

const useStyles = makeStyles((theme) => ({
  fancyButton: theme.fancyButton,
}));

export default FancyButton;
