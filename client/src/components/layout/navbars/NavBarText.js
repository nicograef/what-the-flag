// React and Redux
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'

// Material UI
import { AppBar, Toolbar, Typography, Link, IconButton } from '@mui/material'
import { ArrowBackIos as BackIcon } from '@mui/icons-material'

const NavBarText = ({ text }) => (
  <AppBar position='static'>
    <Toolbar>
      <IconButton edge='start' color='inherit' aria-label='back to dashboard'>
        <Link component={RouterLink} color='inherit' to='/dashboard'>
          <BackIcon />
        </Link>
      </IconButton>
      <Typography variant='h6' style={{ flexGrow: 1 }}>
        {text}
      </Typography>
    </Toolbar>
  </AppBar>
)

NavBarText.propTypes = {
  text: PropTypes.string.isRequired
}

export default NavBarText
