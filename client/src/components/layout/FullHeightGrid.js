import React from 'react'
import PropTypes from 'prop-types'

import { makeStyles } from '@mui/styles'
import { Grid } from '@mui/material'

const FullHeightGrid = ({ withNavbar, children, ...rest }) => {
  const classes = useStyles()
  const className = withNavbar ? classes.withNavbar : classes.withoutNavbar
  return (
    <Grid
      container
      direction='column'
      justify='space-evenly'
      alignItems='center'
      className={className}
      {...rest}
    >
      {children}
    </Grid>
  )
}

const useStyles = makeStyles(theme => ({
  withoutNavbar: {
    minHeight: '100vh',
    maxWidth: 600,
    margin: '0 auto',
    padding: theme.spacing(2)
  },
  withNavbar: {
    minHeight: 'calc(100vh - 56px)',
    maxWidth: 600,
    margin: '0 auto',
    padding: theme.spacing(2)
  },
  '@media (min-width: 600px)': {
    withNavbar: {
      minHeight: 'calc(100vh - 64px)'
    }
  }
}))

FullHeightGrid.propTypes = {
  withNavbar: PropTypes.bool
}

export default FullHeightGrid
