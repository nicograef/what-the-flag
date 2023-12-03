import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

import { makeStyles } from '@mui/styles'
import { Grid, Card, Button, Typography, LinearProgress } from '@mui/material'

const Question = ({ question, quizMode, options, onOptionSelected }) => {
  const { container, button, imgQuestion, timer } = useStyles()

  const [time, setTime] = useState(110) // 110 is a workaround here

  useEffect(() => {
    setTime(110) // 110 is a workaround here

    function updateTime() {
      setTime((time) => time - 1)
    }

    const interval = setInterval(updateTime, 200)
    return () => {
      clearInterval(interval)
    }
  }, [question])

  const toFlag = /to-flag/.test(quizMode)
  const fromFlag = /flag-to/.test(quizMode)

  if (time < 0) onOptionSelected(null)

  return (
    <Grid
      container
      direction="column"
      alignItems="stretch"
      justify="center"
      className={container}
    >
      <Grid item>
        {fromFlag ? (
          <Card>
            <img
              className={imgQuestion}
              src={question}
              alt={'Flag'}
            />
          </Card>
        ) : (
          <Typography
            variant="h4"
            component="h2"
            align="center"
          >
            {question}
          </Typography>
        )}
      </Grid>

      <Grid
        item
        className={timer}
      >
        <LinearProgress
          variant="determinate"
          value={time > 100 ? 100 : time}
          color="secondary"
        />
      </Grid>
      <Grid
        container
        direction="column"
        alignItems="stretch"
        justify="center"
        className={container}
      >
        {options.map((option) =>
          toFlag ? (
            <Card
              key={option}
              className={button}
              onClick={() => onOptionSelected(option)}
              style={{ backgroundImage: `url(${option})` }}
            >
              &nbsp;
            </Card>
          ) : (
            <Button
              key={option}
              className={button}
              onClick={() => onOptionSelected(option)}
              fullWidth
              size="large"
              variant="outlined"
            >
              {option}
            </Button>
          ),
        )}
      </Grid>
    </Grid>
  )
}

const useStyles = makeStyles((theme) => ({
  container: {
    margin: 0,
    flexGrow: 1,
  },
  button: {
    flexGrow: 1,
    marginBottom: theme.spacing(1),
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    '&:last-child': {
      marginBottom: 0,
    },
  },
  imgQuestion: {
    width: '100%',
    maxHeight: 250,
    objectFit: 'cover',
    verticalAlign: 'middle',
  },
  timer: {
    padding: theme.spacing(2),
  },
}))

Question.propTypes = {
  question: PropTypes.string.isRequired,
  quizMode: PropTypes.string.isRequired,
  options: PropTypes.array.isRequired,
  onOptionSelected: PropTypes.func.isRequired,
}

export default Question
