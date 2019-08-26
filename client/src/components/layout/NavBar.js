import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { logout } from '../../actions/auth'

// Material UI
import { AppBar, Toolbar, Typography, Chip } from '@material-ui/core'

const NavBar = ({ dashboard, challenge, text, questionCounter, user, logout }) => {
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
          <Typography variant='h6' style={{ flexGrow: 1 }} onClick={e => logout()}>
            {user.emoji}
            {user.username}
          </Typography>
          <Chip color='secondary' size='small' label={`${user.points} Points`} />
          {/* <LogoutIcon style={{ paddingLeft: 10 }} color='inherit' onClick={logout} /> */}
        </Toolbar>
      </AppBar>
    )

  if (text && text.length > 0)
    return (
      <AppBar position='static'>
        <Toolbar>
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
  user: PropTypes.object,
  logout: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  authenticated: state.auth.authenticated,
  user: state.auth.user
})

export default connect(
  mapStateToProps,
  { logout }
)(NavBar)
