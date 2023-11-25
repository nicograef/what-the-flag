// React and Redux
import React, { Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Components
import Navbar from '../components/layout/NavBar'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Spinner from '../components/layout/Spinner'
import Leaderboard from '../components/leaderboard/Leaderboard'

const Profile = ({ loading, challengeOfTheWeek }) => {
  // This is now solved on server side
  // const sortedUsers = users.sort((a, b) => b.points - a.points)

  if (loading || !challengeOfTheWeek || !challengeOfTheWeek.results)
    return (
      <Fragment>
        <FullHeightGrid>
          <Spinner />
        </FullHeightGrid>
      </Fragment>
    )

  return (
    <Fragment>
      <Navbar text="Challenge of the Week" />
      <FullHeightGrid
        withNavbar
        style={{ padding: 0 }}
      >
        <Leaderboard users={challengeOfTheWeek.results} />
      </FullHeightGrid>
    </Fragment>
  )
}

Profile.propTypes = {
  loading: PropTypes.bool.isRequired,
  challengeOfTheWeek: PropTypes.object.isRequired,
}

const mapStateToProps = (state) => ({
  loading: state.challenges.loading,
  challengeOfTheWeek: state.challenges.challengeOfTheWeek,
})

export default connect(mapStateToProps)(Profile)
