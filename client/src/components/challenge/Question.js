import React from 'react'
import PropTypes from 'prop-types'

import { makeStyles } from '@material-ui/core/styles'
import { Grid, Card, Button, Typography } from '@material-ui/core'

const Question = ({ question, quizMode, answer, options, onOptionSelected }) => {
  const { button, imgQuestion, card } = useStyles()

  return (
    <Grid container spacing={2} direction='column' justify='center'>
      <Grid item>
        {quizMode.match(/flag-to/) ? (
          <Card>
            <img className={imgQuestion} src={question} alt={answer} />
          </Card>
        ) : (
          <Card className={card}>
            <Typography variant='h4' align='center'>
              {question}
            </Typography>
          </Card>
        )}
      </Grid>
      <Grid item>
        <Typography align='center'>⬆️ {quizMode.toUpperCase().replace(/-/g, ' ')} ⬇️</Typography>
      </Grid>
      <Grid item>
        {options.map(option => (
          <Button
            key={option}
            className={button}
            onClick={e => onOptionSelected(option)}
            fullWidth
            size='large'
            variant='outlined'
          >
            {option}
          </Button>
        ))}
      </Grid>
    </Grid>
  )
}

const useStyles = makeStyles(theme => ({
  button: {
    // marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1)
  },
  imgQuestion: {
    width: '100%',
    maxHeight: 250,
    objectFit: 'cover',
    verticalAlign: 'middle'
  },
  card: {
    padding: theme.spacing(2)
  }
}))

Question.propTypes = {
  question: PropTypes.string.isRequired,
  quizMode: PropTypes.string.isRequired,
  answer: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  onOptionSelected: PropTypes.func.isRequired
}

export default Question
