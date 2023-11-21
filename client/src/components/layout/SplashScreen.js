// React and Redux
import React from 'react'
import { Navigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Components
import Copyright from './Copyright'

// Import Logo / Image
import Logo from './questionmark.gif'
import FullHeightGrid from './FullHeightGrid'

const SplashScreen = ({ loading, authenticated }) => {
  if (loading)
    return (
      <FullHeightGrid>
        <img src={Logo} alt='What The Flag Logo' />
        <Copyright />
      </FullHeightGrid>
    )
  if (authenticated) return <Navigate to='/dashboard' replace="true" />
  return <Navigate to='/login' />
}

SplashScreen.propTypes = {
  loading: PropTypes.bool.isRequired
}

const mapStateToProps = state => ({
  loading: state.auth.loading
})

export default connect(mapStateToProps)(SplashScreen)
