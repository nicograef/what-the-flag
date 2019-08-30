// React and Redux
import React from 'react'
import PropTypes from 'prop-types'

// Material UI
import { AppBar, Toolbar, Typography, Chip } from '@material-ui/core'

const NavBarChallenge = ({ text, questionCounter }) => (
  <AppBar position='static'>
    <Toolbar>
      <Typography variant='h6' style={{ flexGrow: 1, lineHeight: 1 }}>
        Challenge{' '}
        <Typography variant='caption' component='span' style={{ whiteSpace: 'nowrap' }}>
          {`🆚${text}`}
        </Typography>
      </Typography>
      <Chip color='secondary' size='small' label={`${questionCounter}`} />
    </Toolbar>
  </AppBar>
)

NavBarChallenge.propTypes = {
  text: PropTypes.string.isRequired,
  questionCounter: PropTypes.string.isRequired
}

export default NavBarChallenge
