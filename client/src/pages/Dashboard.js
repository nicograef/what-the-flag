// React and Redux
import React, { useEffect, useState, Fragment } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'

// Actions
import { loadUser } from '../store/actions/auth'
import { newChallenge } from '../store/actions/challenges'

// Material UI
import { Box } from '@mui/material'

// Components
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'
import ChallengeOfTheWeekCard from '../components/dashboard/ChallengeOfTheWeekCard'
import Challenges from '../components/dashboard/Challenges'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import SelectUserDialog from '../components/dashboard/SelectUserDialog'
import FancyButton from '../components/layout/FancyButton'

const Dashboard = ({ user, loadUser, newChallenge }) => {
  const [showSelectUserDialog, setShowSelectUserDialog] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    loadUser()
  }, [loadUser])

  if (!user) return <Spinner />

  const onSelect = (username) => {
    setShowSelectUserDialog(false)
    newChallenge(username, navigate)
  }

  return (
    <Fragment>
      <NavBar dashboard />
      <FullHeightGrid withNavbar>
        <Box style={{ width: '100%' }}>
          <ChallengeOfTheWeekCard />
        </Box>
        <Box my={4}>
          <FancyButton onClick={() => setShowSelectUserDialog(true)}>Challenge a Friend</FancyButton>
        </Box>
        <SelectUserDialog
          open={showSelectUserDialog}
          onClose={() => setShowSelectUserDialog(false)}
          onSelect={onSelect}
        />
        <Box style={{ flexGrow: 1, width: '100%' }}>
          <Challenges />
        </Box>
      </FullHeightGrid>
    </Fragment>
  )
}

Dashboard.propTypes = {
  user: PropTypes.object,
  loadUser: PropTypes.func.isRequired,
  newChallenge: PropTypes.func.isRequired,
}

const mapStateToProps = (state) => ({
  user: state.auth.user,
})

export default connect(mapStateToProps, { loadUser, newChallenge })(Dashboard)
