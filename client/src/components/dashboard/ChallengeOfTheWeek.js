// React and Redux
import React from 'react'

// Material UI
import { Card, CardActions, CardContent, Button, Typography } from '@material-ui/core'

const ChallengeOfTheWeek = ({ data: { title, subtitle, description, buttonText } }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant='overline' color='textSecondary'>
          {subtitle}
        </Typography>
        <Typography variant='h5' component='h2' gutterBottom>
          {title}
        </Typography>
        <Typography variant='body2' component='p'>
          {description}
        </Typography>
      </CardContent>
      <CardActions>
        <Button disabled color='secondary' fullWidth size='small'>
          {buttonText}
        </Button>
      </CardActions>
    </Card>
  )
}

export default ChallengeOfTheWeek
