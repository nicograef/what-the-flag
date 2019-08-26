// React and Redux
import React, { useEffect } from 'react'
import { BrowserRouter as Router, Route } from 'react-router-dom'
import { connect } from 'react-redux'

// Actions
import { loadUser } from './actions/auth'

// Components
import PrivateRoute from './components/routing/PrivateRout'
import SplashScreen from './components/layout/SplashScreen'
import Login from './components/auth/Login'
import Register from './components/auth/Register'

// Pages
import Dashboard from './pages/Dashboard'
import Challenge from './pages/Challenge'
import ChallengeResult from './pages/ChallengeResult'

// Custom CSS
import './App.css'

function App({ loadUser }) {
  useEffect(() => {
    loadUser()
    // setTimeout(loadUser, 2000)
  }, [loadUser])

  return (
    <Router>
      <Route exact path='/' component={SplashScreen} />
      <PrivateRoute exact path='/dashboard' component={Dashboard} />
      <PrivateRoute exact path='/challenge' component={Challenge} />
      <PrivateRoute exact path='/challenge-result' component={ChallengeResult} />
      <Route exact path='/login' component={Login} />
      <Route exact path='/register' component={Register} />
    </Router>
  )
}

export default connect(
  null,
  { loadUser }
)(App)
