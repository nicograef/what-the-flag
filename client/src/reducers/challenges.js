import {
  CHALLENGE_LOADED,
  CHALLENGES_LOADED,
  CHALLENGE_OF_THE_WEEK_LOADED,
  CLEAR_CHALLENGE,
  SET_LOADING
} from '../actions/types'

const initialState = {
  challenge: null,
  challengeOfTheWeek: null,
  challenges: null,
  loading: true
}

export default (state = initialState, action) => {
  const { type, payload } = action
  switch (type) {
    case CHALLENGE_LOADED:
      return {
        ...state,
        challenge: payload.challenge,
        loading: false
      }
    case CLEAR_CHALLENGE:
      return {
        ...state,
        challenge: null,
        loading: false
      }
    case CHALLENGES_LOADED:
      return {
        ...state,
        challenges: payload.challenges,
        loading: false
      }
    case CHALLENGE_OF_THE_WEEK_LOADED:
      return {
        ...state,
        challengeOfTheWeek: payload.challengeOfTheWeek,
        loading: false
      }
    case SET_LOADING:
      return {
        ...state,
        loading: true
      }
    default:
      return state
  }
}
