import React, { Fragment } from 'react'
import PropTypes from 'prop-types'

import { Button } from '@material-ui/core'

const Options = ({ options }) => {
  return (
    <Fragment>
      {options.map(option => (
        <img src={option} />
      ))}
    </Fragment>
  )
}

Options.propTypes = {}

export default Options
