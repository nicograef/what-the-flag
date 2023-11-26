import React, { Fragment, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import Question from '../components/challenge/Question'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'

import { submitAnswers } from '../store/actions/challenges'

const Challenge = ({ challengeOfTheWeek, loading, submitAnswers }) => {
  const [answers, setAnswers] = useState([])
  const navigate = useNavigate()

  if (!challengeOfTheWeek || loading)
    return (
      <FullHeightGrid>
        <Spinner />
      </FullHeightGrid>
    )

  const { questions, quizMode } = challengeOfTheWeek

  const onOptionSelected = (selectedOption) => {
    setAnswers((previousAnswers) => {
      const answers = [...previousAnswers, selectedOption]
      if (answers.length < questions.length) return answers
      if (answers.length === questions.length) submitAnswers('challenge-of-the-week', answers, navigate)
      return previousAnswers
    })
  }

  return (
    <Fragment>
      <NavBar
        challenge
        ofTheWeek
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
  challengeOfTheWeek: PropTypes.object,
  loading: PropTypes.bool.isRequired,
  submitAnswers: PropTypes.func.isRequired,
}

const mapStateToProps = (state) => ({
  challengeOfTheWeek: state.challenges.challengeOfTheWeek,
  loading: state.challenges.loading,
})

export default connect(mapStateToProps, { submitAnswers })(Challenge)
