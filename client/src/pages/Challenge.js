// React and Redux
import React, { Fragment, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { submitAnswers } from '../actions/challenges'

// Material UI
import { Typography, Paper } from '@material-ui/core'

// Components
import Question from '../components/challenge/Question'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'

const Challenge = ({ challenge, user, loading, submitAnswers, history }) => {
  const [answers, setAnswers] = useState([])
  const [index, setIndex] = useState(0)

  if (!challenge || loading)
    return (
      <FullHeightGrid>
        <Spinner />
      </FullHeightGrid>
    )

  const { questions, quizMode } = challenge

  const userHasChallenged = challenge.from._id === user._id

  const opponent = userHasChallenged
    ? `${challenge.to.emoji}${challenge.to.username}`
    : `${challenge.from.emoji}${challenge.from.username}`

  const onOptionSelected = selectedOption => {
    if (index === questions.length - 1) {
      submitAnswers(challenge._id, [...answers, selectedOption], history)
      return
    } else if (index < questions.length - 1) {
      setAnswers([...answers, selectedOption])
      setIndex(index + 1)
    }
  }

  return (
    <Fragment>
      <NavBar challenge text={opponent} questionCounter={`${index + 1}/${questions.length}`} />
      <FullHeightGrid withNavbar>
        <Question
          {...questions[index]}
          quizMode={questions[index].quizMode || quizMode}
          onOptionSelected={onOptionSelected}
        />
      </FullHeightGrid>
    </Fragment>
  )
}

Challenge.propTypes = {
  challenge: PropTypes.object,
  user: PropTypes.object,
  loading: PropTypes.bool.isRequired,
  submitAnswers: PropTypes.func.isRequired,
  history: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
  challenge: state.challenges.challenge,
  user: state.auth.user,
  loading: state.challenges.loading
})

export default connect(
  mapStateToProps,
  { submitAnswers }
)(Challenge)
