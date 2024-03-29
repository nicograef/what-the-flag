import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { Typography, Button, Chip, Box } from '@mui/material'

import FullHeightGrid from '../components/layout/FullHeightGrid'
import Navbar from '../components/layout/NavBar'

import { logout } from '../store/actions/auth'

const Profile = ({ user, logout }) => {
  const { username, email, emoji } = user

  return (
    <Fragment>
      <Navbar text="Profile" />

      <FullHeightGrid withNavbar>
        <Typography
          variant="h1"
          gutterBottom
          style={{ marginTop: '0.35em' }}
        >
          {emoji}
        </Typography>
        <Typography
          variant="h4"
          gutterBottom
        >
          <Chip
            color="secondary"
            label={`${user.points} Points`}
          />
        </Typography>
        <Typography
          variant="h4"
          gutterBottom
        >
          {username}
        </Typography>
        <Typography
          variant="body1"
          color="textSecondary"
          gutterBottom
        >
          {email}
        </Typography>
        <Box style={{ flexGrow: 1 }}></Box>
        <Button onClick={() => logout()}>Log out</Button>
      </FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  user: PropTypes.object.isRequired,
  logout: PropTypes.func.isRequired,
}

const mapStateToProps = (state) => ({
  user: state.auth.user,
})

export default connect(mapStateToProps, { logout })(Profile)
