// React and Redux
import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Components
import Navbar from '../components/layout/NavBar'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Leaderboard from '../components/leaderboard/Leaderboard'

const Profile = ({ users }) => {
  const sortedUsers = users.sort((a, b) => b.points - a.points)

  return (
    <Fragment>
      <Navbar text='Leaderboard' />
      <FullHeightGrid withNavbar style={{ padding: 0 }}>
        <Leaderboard users={sortedUsers} />
      </FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  users: PropTypes.array.isRequired
}

const mapStateToProps = state => ({
  users: state.auth.users
})

export default connect(mapStateToProps)(Profile)
