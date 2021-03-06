// React and Redux
import React, { Fragment, useState, useEffect } from 'react'
import { Redirect, Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { login, clearErrors } from '../actions/auth'

// Material UI
import { Button, Link, Typography } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

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

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value })

  const onSubmit = async e => {
    e.preventDefault()
    login(username, password)
  }

  // If user is (already) logged in (i.e. has a valid token), redirect to /dashboard
  if (authenticated) return <Redirect to='/dashboard' />

  return (
    <FullHeightGrid>
      <form noValidate onSubmit={onSubmit}>
        <Typography align='center' component='h1' variant='h5'>
          Log In
        </Typography>
        <Input username value={username} onChange={onChange} error={errors && errors.username} />
        <PasswordInput value={password} onChange={onChange} error={errors && errors.password} />
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
              Go!
            </Button>

            <Link component={RouterLink} to='/register'>
              <Button size='small' fullWidth variant='text'>
                Don't have an account?
                <Typography color='secondary' variant='button' component='span'>
                  &nbsp;Sign Up
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

Login.propTypes = {
  errors: PropTypes.object,
  authenticated: PropTypes.bool.isRequired,
  loading: PropTypes.bool.isRequired,
  login: PropTypes.func.isRequired,
  clearErrors: PropTypes.func.isRequired
}

const mapStateToPros = state => ({
  errors: state.auth.errors,
  authenticated: state.auth.authenticated,
  loading: state.auth.loading
})

export default connect(
  mapStateToPros,
  { login, clearErrors }
)(Login)
