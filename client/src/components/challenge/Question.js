import React from 'react'
import PropTypes from 'prop-types'

import { makeStyles } from '@material-ui/core/styles'
import { Grid, Card, Button } from '@material-ui/core'

const Question = ({ question, answer, options, onOptionSelected }) => {
  const { button, imgQuestion } = useStyles()

  return (
    <Grid container spacing={2} direction='column' justify='center'>
      <Grid item>
        <Card>
          <img className={imgQuestion} src={question} alt={answer} />
        </Card>
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
  }
}))

Question.propTypes = {
  question: PropTypes.string.isRequired,
  answer: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  onOptionSelected: PropTypes.func.isRequired
}

export default Question
