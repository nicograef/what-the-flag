import React, { Fragment, useState, useEffect } from 'react'
import { Navigate, Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { makeStyles } from '@mui/styles'
import { Button, Typography, Link } from '@mui/material'

import Spinner from '../components/layout/Spinner'
import PasswordInput from '../components/auth/PasswordInput'
import Input from '../components/auth/Input'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Copyright from '../components/layout/Copyright'

import { register, clearErrors } from '../store/actions/auth'

const Register = ({ loading, authenticated, errors, register, clearErrors }) => {
  const classes = useStyles()

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  })
  const { username, email, password } = formData

  useEffect(() => {
    clearErrors()
  }, [clearErrors])

  const onChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value })

  const onSubmit = async (e) => {
    e.preventDefault()
    register(username, email, password)
  }

  // redirect authenticated users
  if (authenticated)
    return (
      <Navigate
        to="/dashboard"
        replace="true"
      />
    )

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
          Sign up to play against friends!
        </Typography>
        <Input
          username
          value={username}
          onChange={onChange}
          error={errors && errors.username}
        />
        <Input
          email
          value={email}
          onChange={onChange}
          error={errors && errors.email}
        />
        <PasswordInput
          register
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
              Sign up
            </Button>
            <p></p>
            <Link
              component={RouterLink}
              to="/"
            >
              <Button
                fullWidth
                variant="text"
              >
                Already have an account?
                <Typography
                  color="secondary"
                  variant="button"
                  component="span"
                >
                  &nbsp;Log In
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

Register.propTypes = {
  loading: PropTypes.bool.isRequired,
  authenticated: PropTypes.bool.isRequired,
  errors: PropTypes.object,
  register: PropTypes.func.isRequired,
  clearErrors: PropTypes.func.isRequired,
}

const mapStateToPros = (state) => ({
  loading: state.auth.loading,
  authenticated: state.auth.authenticated,
  errors: state.auth.errors,
})

export default connect(mapStateToPros, { register, clearErrors })(Register)
