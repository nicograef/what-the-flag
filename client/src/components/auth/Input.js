// React and Redux
import React from 'react'
import PropTypes from 'prop-types'

// Material UI
import { TextField } from '@material-ui/core'

const Input = ({ email, username, value, variant, error, onChange }) => {
  let name, label, type, autoComplete

  if (email) {
    name = 'email'
    label = 'Email'
    type = 'email'
    autoComplete = 'email'
  }
  if (username) {
    name = 'username'
    label = 'Username'
    type = 'text'
    autoComplete = 'username'
  }

  return (
    <TextField
      fullWidth
      required
      margin='normal'
      variant={variant || 'outlined'}
      name={name}
      type={type}
      autoComplete={autoComplete}
      error={error && error !== ''}
      label={label}
      helperText={error}
      value={value}
      onChange={onChange}
    />
  )
}

Input.propTypes = {
  username: PropTypes.bool,
  email: PropTypes.bool,
  value: PropTypes.string.isRequired,
  variant: PropTypes.string,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired
}

export default Input
