import { combineReducers } from 'redux'
import auth from './auth'
import challenges from './challenges'

export default combineReducers({ auth, challenges })
