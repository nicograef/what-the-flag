// React and Redux
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI
import { AppBar, Toolbar, Typography, Chip, Link, IconButton } from '@material-ui/core'
import { ArrowBackIos as BackIcon } from '@material-ui/icons'

const NavBar = ({ dashboard, challenge, text, questionCounter, user }) => {
  if (challenge) {
    return (
      <AppBar position='static'>
        <Toolbar>
          <Typography variant='h6' style={{ flexGrow: 1 }}>
            Challenge
          </Typography>
          <Chip color='secondary' size='small' label={`Question ${questionCounter}`} />
        </Toolbar>
      </AppBar>
    )
  }
  if (dashboard)
    return (
      <AppBar position='static'>
        <Toolbar>
          <Typography variant='h6' style={{ flexGrow: 1 }}>
            <Link component={RouterLink} color='inherit' to='/profile'>
              {user.emoji}
              {user.username}
            </Link>
          </Typography>
          <Link component={RouterLink} color='inherit' to='/leaderboard'>
            <Chip color='secondary' size='small' label={`${user.points} Points`} />
          </Link>
        </Toolbar>
      </AppBar>
    )

  if (text && text.length > 0)
    return (
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

  return (
    <AppBar position='static'>
      <Toolbar>
        <Typography variant='h6' style={{ flexGrow: 1 }}>
          What The Flag
        </Typography>
      </Toolbar>
    </AppBar>
  )
}

NavBar.propTypes = {
  dashboard: PropTypes.bool,
  challenge: PropTypes.bool,
  user: PropTypes.object
}

const mapStateToProps = state => ({
  authenticated: state.auth.authenticated,
  user: state.auth.user
})

export default connect(mapStateToProps)(NavBar)
