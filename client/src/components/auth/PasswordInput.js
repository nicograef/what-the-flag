// React and Redux
import React, { useState } from 'react'
import PropTypes from 'prop-types'

// Material UI
import { TextField, InputAdornment, IconButton } from '@material-ui/core'
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon
} from '@material-ui/icons'

const PasswordInput = ({ register, value, error, onChange }) => {
  const [showPassword, setShowPassword] = useState(false)

  const autoComplete = register ? 'off' : 'current-password'

  return (
    <TextField
      fullWidth
      required
      margin='normal'
      variant='outlined'
      name='password'
      value={value}
      label='Password'
      type={showPassword ? 'text' : 'password'}
      error={error && error !== ''}
      onChange={onChange}
      autoComplete={autoComplete}
      helperText={error}
      InputProps={{
        endAdornment: (
          <InputAdornment position='end'>
            <IconButton
              edge='end'
              aria-label='toggle password visibility'
              onClick={e => setShowPassword(!showPassword)}
            >
              {showPassword ? <VisibilityIcon /> : <VisibilityOffIcon />}
            </IconButton>
          </InputAdornment>
        )
      }}
    />
  )
}

PasswordInput.propTypes = {
  value: PropTypes.string.isRequired,
  error: PropTypes.string,
  onChange: PropTypes.func.isRequired
}

export default PasswordInput
