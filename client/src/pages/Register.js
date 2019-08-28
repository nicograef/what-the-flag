// React and Redux
import React, { Fragment, useState, useEffect } from 'react'
import { Redirect, Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { register, clearErrors } from '../actions/auth'

// Material UI
import { makeStyles } from '@material-ui/core/styles'
import { Button, Typography, Link } from '@material-ui/core'

// Components
import Spinner from '../components/layout/Spinner'
import PasswordInput from '../components/auth/PasswordInput'
import Input from '../components/auth/Input'
import FullHeightGrid from '../components/layout/FullHeightGrid'
import Copyright from '../components/layout/Copyright'

const Register = ({ loading, authenticated, errors, register, clearErrors }) => {
  const classes = useStyles()

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  })
  const { username, email, password } = formData

  useEffect(() => {
    clearErrors()
  }, [clearErrors])

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value })

  const onSubmit = async e => {
    e.preventDefault()
    register(username, email, password)
  }

  // If user is (already) registered or logged in (i.e. has a valid token), redirect to /dashboard
  if (authenticated) return <Redirect to='/dashboard' />

  return (
    <FullHeightGrid>
      <form noValidate onSubmit={onSubmit}>
        <Typography align='center' component='h1' variant='h5'>
          Sign Up
        </Typography>
        <Input username value={username} onChange={onChange} error={errors && errors.username} />
        <Input email value={email} onChange={onChange} error={errors && errors.email} />
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
              type='submit'
              className={classes.submit}
              fullWidth
              variant='contained'
              color='primary'
            >
              Sign Up
            </Button>
            <Link component={RouterLink} to='/'>
              <Button size='small' fullWidth variant='text'>
                Already have an account?
                <Typography color='secondary' variant='button' component='span'>
                  &nbsp;Log In
                </Typography>
              </Button>
            </Link>
          </Fragment>
        )}
      </form>
      <Copyright />
    </FullHeightGrid>
  )
}

const useStyles = makeStyles(theme => ({
  submit: {
    margin: theme.spacing(2, 0, 4, 0)
  }
}))

Register.propTypes = {
  loading: PropTypes.bool.isRequired,
  authenticated: PropTypes.bool.isRequired,
  errors: PropTypes.object,
  register: PropTypes.func.isRequired,
  clearErrors: PropTypes.func.isRequired
}

const mapStateToPros = state => ({
  loading: state.auth.loading,
  authenticated: state.auth.authenticated,
  errors: state.auth.errors
})

export default connect(
  mapStateToPros,
  { register, clearErrors }
)(Register)
