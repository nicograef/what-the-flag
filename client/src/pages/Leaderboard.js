import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI

// Components
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Navbar from '../components/layout/NavBar'

const Profile = ({ users }) => {
  return (
    <Fragment>
      <Navbar text='Leaderboard' />

      <FullHeightGrid withNavbar>Hello World</FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  user: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
  users: state.auth.users
})

export default connect(mapStateToProps)(Profile)
