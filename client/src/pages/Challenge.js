// React and Redux
import React, { Fragment, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'

// Actions
import { submitAnswers } from '../store/actions/challenges'

// Components
import Question from '../components/challenge/Question'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'

const Challenge = ({ challenge, user, loading, submitAnswers }) => {
  const [answers, setAnswers] = useState([])
  const navigate = useNavigate()

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

  const onOptionSelected = (selectedOption) => {
    setAnswers((previousAnswers) => {
      const answers = [...previousAnswers, selectedOption]
      if (answers.length < questions.length) return answers
      if (answers.length === questions.length) submitAnswers(challenge._id, answers, navigate)
      return previousAnswers
    })
  }

  return (
    <Fragment>
      <NavBar
        challenge
        text={opponent}
        questionCounter={`${answers.length + 1}/${questions.length}`}
      />
      <FullHeightGrid withNavbar>
        <Question
          {...questions[answers.length]}
          quizMode={questions[answers.length].quizMode || quizMode}
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
}

const mapStateToProps = (state) => ({
  challenge: state.challenges.challenge,
  user: state.auth.user,
  loading: state.challenges.loading,
})

export default connect(mapStateToProps, { submitAnswers })(Challenge)
