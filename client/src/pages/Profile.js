import React, { Fragment, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { logout } from '../actions/auth'

// Material UI
import { Typography, Button, Chip, Box } from '@material-ui/core'

// Components
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Navbar from '../components/layout/NavBar'

const Profile = ({ user, logout }) => {
  const [userData, setUserData] = useState({
    username: user.username,
    email: user.email,
    emoji: user.emoji
  })
  const { username, email, emoji } = userData

  const onChange = e => setUserData({ ...userData, [e.target.name]: e.target.value })

  return (
    <Fragment>
      <Navbar text='Profile' />

      <FullHeightGrid withNavbar>
        <Typography variant='h1' gutterBottom style={{ marginTop: '0.35em' }}>
          {emoji}
        </Typography>
        <Typography variant='h4' gutterBottom>
          <Chip color='secondary' label={`${user.points} Points`} />
        </Typography>
        <Typography variant='h4' gutterBottom>
          {username}
        </Typography>
        <Typography variant='body1' color='textSecondary' gutterBottom>
          {email}
        </Typography>
        <Box style={{ flexGrow: 1 }}></Box>
        <Button onClick={e => logout()}>Log out</Button>
      </FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  user: PropTypes.object.isRequired,
  logout: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  user: state.auth.user
})

export default connect(
  mapStateToProps,
  { logout }
)(Profile)
