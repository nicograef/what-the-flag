// React and Redux
import React, { Fragment, useState } from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { submitAnswers } from '../actions/challenges'

// Components
import Question from '../components/challenge/Question'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import NavBar from '../components/layout/NavBar'
import Spinner from '../components/layout/Spinner'

const Challenge = ({ challengeOfTheWeek, loading, submitAnswers, history }) => {
  const [answers, setAnswers] = useState([])

  if (!challengeOfTheWeek || loading)
    return (
      <FullHeightGrid>
        <Spinner />
      </FullHeightGrid>
    )

  const { questions, quizMode } = challengeOfTheWeek

  const onOptionSelected = selectedOption => {
    setAnswers(previousAnswers => {
      const answers = [...previousAnswers, selectedOption]
      if (answers.length === questions.length)
        submitAnswers(challengeOfTheWeek._id, answers, history)
      return answers
    })
  }

  return (
    <Fragment>
      <NavBar
        challenge
        text={'of the week'}
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
  history: PropTypes.object.isRequired
}

const mapStateToProps = state => ({
  challengeOfTheWeek: state.challenges.challengeOfTheWeek,
  loading: state.challenges.loading
})

export default connect(
  mapStateToProps,
  { submitAnswers }
)(Challenge)
