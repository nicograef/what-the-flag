// React and Redux
import React, { useEffect } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Moment Js
import moment from 'moment'

// Actions
import { getChallenges, showChallenge } from '../../actions/challenges'

// Material UI
import { List, ListItem, ListItemText, Paper, ListItemSecondaryAction } from '@material-ui/core'
import {
  HourglassEmpty as WaitingIcon,
  NewReleases as NewIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon
} from '@material-ui/icons'

const Challenges = ({ loading, challenges, getChallenges, showChallenge, history }) => {
  useEffect(() => {
    getChallenges()
  }, [getChallenges])

  // if (loading) return <p>Loading challenges ...</p>

  if (!challenges && !loading) return <p>No challenges yet.</p>

  return (
    <Paper style={{ width: '100%' }}>
      <List dense disablePadding>
        {challenges &&
          challenges.map(({ _id, createdAt, from, to, status }) => (
            <ListItem button divider key={_id} onClick={e => showChallenge(_id, history)}>
              <ListItemText
                primary={(from && `${from} challenged you`) || (to && `you challenged ${to}`)}
                secondary={moment(createdAt).fromNow()}
              />
              <ListItemSecondaryAction>
                {status === 'new' && <NewIcon color='secondary' />}
                {status === 'waiting' && <WaitingIcon color='secondary' />}
                {status === 'win' && <ThumbUpIcon color='secondary' />}
                {status === 'loss' && <ThumbDownIcon color='secondary' />}
                {/* {status === 'completed'} */}
              </ListItemSecondaryAction>
            </ListItem>
          ))}
      </List>
    </Paper>
  )
}

Challenges.propTypes = {
  loading: PropTypes.bool.isRequired,
  challenges: PropTypes.array,
  getChallenges: PropTypes.func.isRequired,
  showChallenge: PropTypes.func.isRequired,
  history: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
  loading: state.challenges.loading,
  challenges: state.challenges.challenges
})

export default connect(
  mapStateToProps,
  { getChallenges, showChallenge }
)(Challenges)
