import React, { Fragment, useState, useEffect } from 'react'
import { Navigate, Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { Button, Link, Typography } from '@mui/material'
import { makeStyles } from '@mui/styles'

// Actions
import { login, clearErrors } from '../actions/auth'

// Components
import Spinner from '../components/layout/Spinner'
import Input from '../components/auth/Input'
import PasswordInput from '../components/auth/PasswordInput'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Copyright from '../components/layout/Copyright'

const Login = ({ authenticated, loading, errors, login, clearErrors }) => {
  const classes = useStyles()

  const [formData, setFormData] = useState({ username: '', password: '' })
  const { username, password } = formData

  useEffect(() => {
    clearErrors()
  }, [clearErrors])

  const onChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    login(username, password)
  }

  // redirect authenticated users
  if (authenticated) {
    return (
      <Navigate
        to="/dashboard"
        replace="true"
      />
    )
  }

  return (
    <FullHeightGrid>
      <form
        noValidate
        onSubmit={onSubmit}
      >
        <Typography
          align="center"
          component="h1"
          variant="h5"
        >
          Login to play!
        </Typography>
        <Input
          username
          value={username}
          onChange={onChange}
          error={errors && errors.username}
        />
        <PasswordInput
          value={password}
          onChange={onChange}
          error={errors && errors.password}
        />
        {loading ? (
          <Spinner />
        ) : (
          <Fragment>
            <Button
              type="submit"
              className={classes.submit}
              fullWidth
              variant="contained"
              color="primary"
            >
              Login
            </Button>

            <p></p>

            <Link
              component={RouterLink}
              to="/register"
            >
              <Button
                fullWidth
                variant="text"
              >
                Don&apos;t have an account?
                <Typography
                  color="secondary"
                  variant="button"
                  component="span"
                >
                  &nbsp;Sign Up
                </Typography>
              </Button>
            </Link>
          </Fragment>
        )}
      </form>
      <p></p>
      <Copyright />
    </FullHeightGrid>
  )
}

const useStyles = makeStyles((theme) => ({
  submit: {
    margin: theme.spacing(2, 0, 4, 0),
  },
}))

Login.propTypes = {
  errors: PropTypes.object,
  authenticated: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  login: PropTypes.func.isRequired,
  clearErrors: PropTypes.func.isRequired,
}

const mapStateToPros = (state) => ({
  errors: state.auth.errors,
  authenticated: state.auth.authenticated,
  loading: state.auth.loading,
})

export default connect(mapStateToPros, { login, clearErrors })(Login)
