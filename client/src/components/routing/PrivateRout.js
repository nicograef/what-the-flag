import React from 'react'
import PropTypes from 'prop-types'
import { Navigate } from 'react-router-dom'
import { connect } from 'react-redux'

const PrivateRoute = ({ children, authenticated }) => {
  return authenticated ? (
    children
  ) : (
    <Navigate
      to="/"
      replace="true"
    />
  )
}

PrivateRoute.propTypes = {
  authenticated: PropTypes.bool.isRequired,
  children: PropTypes.array,
}

const mapStateToProps = (state) => ({
  authenticated: state.auth.authenticated,
})

export default connect(mapStateToProps)(PrivateRoute)
