// React and Redux
import React from 'react'
import PropTypes from 'prop-types'

// Material UI
import { AppBar, Toolbar, Typography, Chip } from '@material-ui/core'

const NavBarChallenge = ({ ofTheWeek, text, questionCounter }) => (
  <AppBar position='static'>
    <Toolbar>
      <Typography variant='h6' style={{ flexGrow: 1, lineHeight: 1 }}>
        Challenge{' '}
        {ofTheWeek ? (
          'of the Week'
        ) : (
          <Typography variant='caption' component='span' style={{ whiteSpace: 'nowrap' }}>
            {`🆚${text}`}
          </Typography>
        )}
      </Typography>
      <Chip color='secondary' size='small' label={`${questionCounter}`} />
    </Toolbar>
  </AppBar>
)

NavBarChallenge.propTypes = {
  ofTheWeek: PropTypes.bool,
  text: PropTypes.string,
  questionCounter: PropTypes.string.isRequired
}

export default NavBarChallenge
