// React
import React from 'react'

// Material UI
import { Typography } from '@mui/material'
import { FavoriteRounded as FavIcon } from '@mui/icons-material'

const Copyright = () => (
  <Typography
    variant="body2"
    color="textSecondary"
    align="center"
  >
    Built with{' '}
    <FavIcon
      fontSize="small"
      style={{ marginBottom: '-0.25rem' }}
    />{' '}
    by Nico Gräf
  </Typography>
)
export default Copyright
