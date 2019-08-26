// React and Redux
import React, { Fragment, useState, useEffect } from 'react'
import { Redirect, Link as RouterLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Actions
import { login, clearErrors } from '../../actions/auth'

// Material UI
import { Button, Link } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

// Components
import Spinner from '../layout/Spinner'
import Input from './Input'
import PasswordInput from './PasswordInput'
import FullHeightGrid from '../layout/FullHeightGrid'

const Login = ({ authenticated, loading, errors, login, clearErrors }) => {
  const classes = useStyles()

  const [formData, setFormData] = useState({ email: '', password: '' })
  const { email, password } = formData

  useEffect(() => {
    clearErrors()
  }, [clearErrors])

  const onChange = e => setFormData({ ...formData, [e.target.name]: e.target.value })

  const onSubmit = async e => {
    e.preventDefault()
    login(email, password)
  }

  // If user is (already) logged in (i.e. has a valid token), redirect to /dashboard
  if (authenticated) return <Redirect to='/dashboard' />

  return (
    <FullHeightGrid>
      <form noValidate onSubmit={onSubmit}>
        <Input email value={email} onChange={onChange} error={errors && errors.email} />
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
              Sign In
            </Button>

            <Link component={RouterLink} to='/register'>
              <Button size='small' fullWidth variant='text'>
                Don't have an account? Sign Up
              </Button>
            </Link>
          </Fragment>
        )}
      </form>
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
