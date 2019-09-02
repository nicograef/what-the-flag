import axios from 'axios'

import {
  CHALLENGE_LOADED,
  CHALLENGES_LOADED,
  CHALLENGE_OF_THE_WEEK_LOADED,
  // CLEAR_CHALLENGE,
  SET_CHALLENGES_LOADING
} from './types'

/**
 *
 */
export const getChallenges = () => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })
  try {
    const response = await axios.get('/api/challenges')
    const challenges = response.data
    dispatch({ type: CHALLENGES_LOADED, payload: { challenges } })
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
export const getChallenge = challengeId => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })
  try {
    const response = await axios.get(`/api/challenges/${challengeId}`)
    const challenge = response.data
    dispatch({ type: CHALLENGE_LOADED, payload: { challenge } })
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
export const getChallengeOfTheWeek = () => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })
  try {
    const response = await axios.get('/api/challengeoftheweek')
    const challengeOfTheWeek = response.data
    dispatch({ type: CHALLENGE_OF_THE_WEEK_LOADED, payload: { challengeOfTheWeek } })
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
export const showChallenge = (challengeId, history) => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })
  history.push('/challenge-result')
  try {
    const response = await axios.get(`/api/challenges/${challengeId}`)
    const challenge = response.data
    dispatch({ type: CHALLENGE_LOADED, payload: { challenge } })
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
export const newChallenge = (username, history) => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })
  history.push('/challenge')
  try {
    const data = { username }
    const response = await axios.post('/api/challenges', data)
    const challenge = response.data
    dispatch({ type: CHALLENGE_LOADED, payload: { challenge } })
  } catch (err) {
    console.error(err)
  }
}

/**
 *
 */
export const submitAnswers = (challengeId, answers, history) => async dispatch => {
  dispatch({ type: SET_CHALLENGES_LOADING })

  if (challengeId === 'challenge of the week') {
    history.push('/challengeoftheweek-leaderboard')
    try {
      const data = { answers }
      const response = await axios.post('/api/challengeoftheweek', data)
      const challengeOfTheWeek = response.data
      dispatch({ type: CHALLENGE_OF_THE_WEEK_LOADED, payload: { challengeOfTheWeek } })
    } catch (err) {
      console.error(err)
    }
  } else {
    history.push('/challenge-result')
    try {
      const data = { answers }
      const response = await axios.post(`/api/challenges/${challengeId}`, data)
      const challenge = response.data
      dispatch({ type: CHALLENGE_LOADED, payload: { challenge } })
    } catch (err) {
      console.error(err)
    }
  }
}
