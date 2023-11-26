// React and Redux
import React, { useEffect, Fragment } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { getChallengeOfTheWeek } from '../../store/actions/challenges'

// Material UI
import { Card, CardActions, CardContent, Button, Typography, Link } from '@mui/material'

const ChallengeOfTheWeekCard = ({ loading, challengeOfTheWeek, getChallengeOfTheWeek }) => {
  useEffect(() => {
    if (!challengeOfTheWeek) getChallengeOfTheWeek()
  }, [challengeOfTheWeek, getChallengeOfTheWeek])

  if (!challengeOfTheWeek && loading)
    return (
      <Card>
        <CardContent>
          <Typography
            variant="overline"
            color="textSecondary"
          >
            <span
              role="img"
              aria-label="trophy"
            >
              🏆
            </span>{' '}
            Challenge of the Week
          </Typography>
          <Typography
            variant="body2"
            component="p"
            align="center"
            style={{ width: '100%' }}
          >
            loading...
          </Typography>
        </CardContent>
      </Card>
    )

  if (!challengeOfTheWeek && !loading) return <Fragment />

  return (
    <Card>
      {challengeOfTheWeek.results ? (
        <CardContent>
          <Typography
            variant="overline"
            color="textSecondary"
            component="h3"
            align="center"
          >
            Challenge of the Week{' '}
            <span
              role="img"
              aria-label="check"
            >
              ✅
            </span>
          </Typography>
        </CardContent>
      ) : (
        <CardContent>
          <Typography
            variant="overline"
            color="textSecondary"
            component="h5"
            align="center"
          >
            <span
              role="img"
              aria-label="trophy"
            >
              🏆
            </span>{' '}
            Challenge of the Week{' '}
            <span
              role="img"
              aria-label="trophy"
            >
              🏆
            </span>
          </Typography>
          <Typography
            variant="h5"
            component="h3"
            gutterBottom
          >
            20 Mixed Questions
          </Typography>
          <Typography
            variant="body2"
            component="p"
          >
            Start this challenge of the week with 20 questions of all quiz modes and compare your score with the
            what-the-flag-community.
          </Typography>
        </CardContent>
      )}
      <CardActions>
        {challengeOfTheWeek.results ? (
          <Link
            style={{ width: '100%' }}
            component={RouterLink}
            to="/challengeoftheweek-leaderboard"
          >
            <Button fullWidth>See Leaderboard</Button>
          </Link>
        ) : (
          <Link
            style={{ width: '100%' }}
            component={RouterLink}
            to="/challengeoftheweek"
          >
            <Button
              color="secondary"
              fullWidth
            >
              START&nbsp;
              <span
                role="img"
                aria-label="start"
              >
                🚀
              </span>
            </Button>
          </Link>
        )}
      </CardActions>
    </Card>
  )
}

ChallengeOfTheWeekCard.propTypes = {
  loading: PropTypes.bool.isRequired,
  challengeOfTheWeek: PropTypes.object,
  getChallengeOfTheWeek: PropTypes.func.isRequired,
}

const mapStateToProps = (state) => ({
  loading: state.challenges.loading,
  challengeOfTheWeek: state.challenges.challengeOfTheWeek,
})

export default connect(mapStateToProps, { getChallengeOfTheWeek })(ChallengeOfTheWeekCard)
