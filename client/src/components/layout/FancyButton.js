import React from 'react'
import PropTypes from 'prop-types'
import { Button } from '@mui/material'
import { makeStyles } from '@mui/styles'

const FancyButton = ({ children, ...rest }) => {
  const { fancyButton } = useStyles()

  return (
    <Button
      className={fancyButton}
      fullWidth
      variant="contained"
      {...rest}
    >
      {children}
    </Button>
  )
}

FancyButton.propTypes = {
  children: PropTypes.any,
}

const useStyles = makeStyles((theme) => ({
  fancyButton: theme.fancyButton,
}))

export default FancyButton
