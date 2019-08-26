// React and Redux
import React from 'react'

// Material UI
import { Button } from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'

const FancyButton = ({ children, ...rest }) => {
  const { fancyButton } = useStyles()

  return (
    <Button className={fancyButton} fullWidth variant='contained' {...rest}>
      {children}
    </Button>
  )
}

const useStyles = makeStyles(theme => ({
  fancyButton: theme.fancyButton
}))

export default FancyButton
