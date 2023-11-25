import axios from 'axios'

import {
  SET_AUTH_LOADING,
  LOGIN_SUCCESS,
  LOGIN_FAIL,
  LOGOUT,
  USER_LOADED,
  USERS_LOADED,
  AUTH_ERROR,
  REGISTER_SUCCESS,
  REGISTER_FAIL,
  CLEAR_ERRORS,
} from './types'

/**
 * Gets user data of currently logged in user (authenticated by the token) from database.
 */
export const loadUser = () => async (dispatch) => {
  if (localStorage.getItem('token')) setAuthToken(localStorage.getItem('token'))

  dispatch({ type: SET_AUTH_LOADING })
  try {
    const response = await axios.get('/api/auth')
    const user = response.data
    dispatch({ type: USER_LOADED, payload: { user } })
  } catch (err) {
    if (err.response) {
      const errorFromBackend = err.response.data
      const errors = { auth: errorFromBackend.msg }
      dispatch({ type: AUTH_ERROR, payload: { errors } })
    } else console.error(err)
  }
}

/**
 *
 */
export const getUsers = () => async (dispatch) => {
  dispatch({ type: SET_AUTH_LOADING })
  try {
    const response = await axios.get('/api/users')
    const users = response.data
    dispatch({ type: USERS_LOADED, payload: { users } })
  } catch (err) {
    if (err.response) {
      const errorFromBackend = err.response.data
      const errors = { auth: errorFromBackend.msg }
      dispatch({ type: AUTH_ERROR, payload: { errors } })
    } else console.error(err)
  }
}

/**
 * Login user with username and password.
 *
 * @param {string} username Username of the user
 * @param {string} password Password of the user
 */
export const login = (username, password) => async (dispatch) => {
  dispatch({ type: SET_AUTH_LOADING })
  try {
    const data = { username, password }
    const response = await axios.post('/api/auth', data)
    const token = response.data.token
    dispatch({ type: LOGIN_SUCCESS, payload: { token } })
  } catch (err) {
    if (err.response) {
      const errorsFromBackend = err.response.data.errors
      const errors = errorsFromBackend.reduce((errors, { param, msg }) => {
        errors[param] = msg
        return errors
      }, {})
      dispatch({ type: LOGIN_FAIL, payload: { errors } })
    } else console.error(err)
  }
}

/**
 * Register user with username, email and password.
 *
 * @param {string} username Username of the user
 * @param {string} email Email of the user
 * @param {string} password Password of the user
 */
export const register = (username, email, password) => async (dispatch) => {
  dispatch({ type: SET_AUTH_LOADING })
  try {
    const data = { username, email, password }
    const response = await axios.post('/api/users', data)
    const token = response.data.token
    dispatch({ type: REGISTER_SUCCESS, payload: { token } })
  } catch (err) {
    if (err.response) {
      const errorsFromBackend = err.response.data.errors
      const errors = errorsFromBackend.reduce((errors, { param, msg }) => {
        errors[param] = msg
        return errors
      }, {})
      dispatch({ type: REGISTER_FAIL, payload: { errors } })
    } else console.error(err)
  }
}

/**
 * Clear all auth errors.
 */
export const clearErrors = () => async (dispatch) => {
  dispatch({ type: CLEAR_ERRORS })
}

/**
 * Log out current user.
 */
export const logout = () => async (dispatch) => {
  dispatch({ type: LOGOUT })
}

/**
 * Sets the given token as the 'x-auth-token' header for all axios requests.
 *
 * @param {string} token The token to authenticate user.
 */
const setAuthToken = (token) => {
  if (token) axios.defaults.headers.common['x-auth-token'] = token
  else delete axios.defaults.headers.common['x-auth-token']
}
