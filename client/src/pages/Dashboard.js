// React and Redux
import React, { useEffect, useState, Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { loadUser } from '../actions/auth'
import { newChallenge } from '../actions/challenges'

// Material UI
import { Box } from '@material-ui/core'

// Components
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'
import ChallengeOfTheWeek from '../components/dashboard/ChallengeOfTheWeek'
import Challenges from '../components/dashboard/Challenges'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import SelectUserDialog from '../components/dashboard/SelectUserDialog'
import FancyButton from '../components/layout/FancyButton'

const Dashboard = ({ user, loadUser, newChallenge, history }) => {
  const [showSelectUserDialog, setShowSelectUserDialog] = useState(false)

  useEffect(() => {
    loadUser()
  }, [loadUser])

  if (!user) return <Spinner />

  const challengeOfTheWeekData = {
    title: 'The European Flags',
    subtitle: '🏆 Challenge of the Week',
    description: 'To complete this challenge you need to guess every flag of the european union.',
    buttonText: 'START'
  }

  const onSelect = username => {
    setShowSelectUserDialog(false)
    newChallenge(username, history)
  }

  return (
    <Fragment>
      <NavBar dashboard />
      <FullHeightGrid withNavbar>
        <ChallengeOfTheWeek data={challengeOfTheWeekData} />
        <Box my={2}>
          <FancyButton onClick={e => setShowSelectUserDialog(true)}>Challenge a Friend</FancyButton>
          <SelectUserDialog
            open={showSelectUserDialog}
            onClose={e => setShowSelectUserDialog(false)}
            onSelect={onSelect}
          />
        </Box>
        <Challenges history={history} />
      </FullHeightGrid>
    </Fragment>
  )
}

Dashboard.propTypes = {
  user: PropTypes.object,
  loadUser: PropTypes.func.isRequired
}

const mapStateToProps = state => ({
  user: state.auth.user
})

export default connect(
  mapStateToProps,
  { loadUser, newChallenge }
)(Dashboard)
