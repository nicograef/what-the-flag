// React and Redux
import React, { Fragment } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Moment JS
import moment from 'moment'

// Material UI
import { makeStyles } from '@material-ui/core/styles'
import { Typography, Paper, Link, Button, Grid, Chip, Box } from '@material-ui/core'

// Components
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Spinner from '../components/layout/Spinner'
import NavBar from '../components/layout/NavBar'

const ChallengeResult = ({ loading, user, challenge }) => {
  const classes = useStyles()

  if (loading || !challenge)
    return (
      <Fragment>
        <NavBar text='Challenge Result' />
        <FullHeightGrid withNavbar>
          <Spinner />
        </FullHeightGrid>
      </Fragment>
    )

  const userHasChallenged = challenge.from._id === user._id

  const opponent = userHasChallenged
    ? `${challenge.to.emoji}${challenge.to.username}`
    : `${challenge.from.emoji}${challenge.from.username}`

  const userAnswer = challenge.answers.find(answer => answer.user === user._id)
  const opponentAnswer = challenge.answers.find(answer => answer.user !== user._id)

  return (
    <Fragment>
      <NavBar text='Challenge Result' />
      <FullHeightGrid withNavbar>
        <Box>
          <Typography align='center' variant='h5' component='h2' gutterBottom>
            {userHasChallenged ? 'you challenged' : opponent}
          </Typography>
          <Typography align='center' variant='h5' component='h2' gutterBottom>
            {userHasChallenged ? opponent : 'challenged you'}
          </Typography>
          <Typography variant='body2' align='center' gutterBottom>
            {moment(challenge.createdAt).fromNow()}
          </Typography>
        </Box>

        <Paper className={classes.paper}>
          <Typography variant='h6' component='h5' gutterBottom>
            you
          </Typography>

          {userAnswer ? (
            <Grid container direction='row' justify='space-between'>
              {userAnswer.result.map((result, index) =>
                result ? <Chip key={index} color='secondary' /> : <Chip key={index} />
              )}
            </Grid>
          ) : (
            'Accept the Challenge!'
          )}
        </Paper>

        <Paper className={classes.paper}>
          <Typography variant='h6' component='h5' gutterBottom>
            {opponent}
          </Typography>
          {opponentAnswer ? (
            <Grid container direction='row' justify='space-between'>
              {opponentAnswer.result.map((result, index) =>
                result ? <Chip key={index} color='secondary' /> : <Chip key={index} />
              )}
            </Grid>
          ) : (
            'Has not accepted the challenge yet.'
          )}
        </Paper>
        {!userAnswer && (
          <Link style={{ width: '100%' }} component={RouterLink} to='/challenge'>
            <Button fullWidth color='primary' variant='contained'>
              ACCEPT!
            </Button>
          </Link>
        )}
        <Link style={{ width: '100%' }} component={RouterLink} to='/dashboard'>
          <Button fullWidth color='primary' variant='outlined'>
            CLOSE
          </Button>
        </Link>
      </FullHeightGrid>
    </Fragment>
  )
}

const useStyles = makeStyles(theme => ({
  paper: {
    width: '100%',
    padding: theme.spacing(2)
  }
}))

ChallengeResult.propTypes = {
  loading: PropTypes.bool.isRequired,
  user: PropTypes.object.isRequired,
  challenge: PropTypes.object
}

const mapStateToProps = state => ({
  loading: state.challenges.loading,
  challenge: state.challenges.challenge,
  user: state.auth.user
})

export default connect(mapStateToProps)(ChallengeResult)
