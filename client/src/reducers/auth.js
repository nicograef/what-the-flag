import {
  SET_AUTH_LOADING,
  REGISTER_SUCCESS,
  REGISTER_FAIL,
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  LOGOUT,
  USER_LOADED,
  USERS_LOADED,
  AUTH_ERROR,
  CLEAR_ERRORS,
} from '../actions/types'

const initialState = {
  authenticated: false,
  token: localStorage.getItem('token'),
  user: null,
  pointsDifference: 0,
  users: null,
  errors: null,
  loading: false,
}

const authReducer = (state = initialState, action) => {
  const { type, payload } = action

  switch (type) {
    case LOGIN_SUCCESS:
    case REGISTER_SUCCESS:
      localStorage.setItem('token', payload.token)
      return {
        ...state,
        token: payload.token,
        authenticated: true,
        errors: null,
        loading: false,
      }
    case USER_LOADED:
      return {
        ...state,
        authenticated: true,
        user: payload.user,
        pointsDifference: state.user ? state.user.points - payload.user.points : 0,
        loading: false,
      }
    case USERS_LOADED:
      return {
        ...state,
        authenticated: true,
        users: payload.users,
        loading: false,
      }
    case REGISTER_FAIL:
    case LOGIN_FAIL:
    case AUTH_ERROR:
      localStorage.removeItem('token')
      return {
        ...state,
        token: null,
        user: null,
        users: null,
        pointsDifference: 0,
        authenticated: false,
        errors: payload.errors,
        loading: false,
      }
    case LOGOUT:
      localStorage.removeItem('token')
      return initialState
    case CLEAR_ERRORS:
      return {
        ...state,
        errors: null,
      }
    case SET_AUTH_LOADING:
      return {
        ...state,
        loading: true,
      }
    default:
      return state
  }
}

export default authReducer
