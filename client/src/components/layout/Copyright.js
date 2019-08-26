// React
import React from 'react'

// Material UI
import { Typography } from '@material-ui/core'
import { FavoriteRounded as FavIcon } from '@material-ui/icons'

const Copyright = () => (
  <Typography variant='body2' color='textSecondary' align='center'>
    Built with <FavIcon fontSize='small' style={{ marginBottom: '-0.25rem' }} /> by Nico Gräf
  </Typography>
)
export default Copyright
