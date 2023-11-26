const path = require('path')
const express = require('express')

const { usersRouter } = require('./api/users/users-router')
const { authRouter } = require('./api/auth')
const { challengesRouter } = require('./api/challenges')
const { challengeOfTheWeekRouter } = require('./api/challengeoftheweek')

class Server {
  constructor(environment, jwtMiddleware) {
    this.environment = environment
    this.jwtMiddleware = jwtMiddleware
    this.app = express()
  }

  init() {
    this.app.use(express.json())

    const validateJwt = this.jwtMiddleware.validateJwt.bind(this.jwtMiddleware)

    this.app.use('/api/users', usersRouter(validateJwt))
    this.app.use('/api/auth', authRouter(validateJwt))
    this.app.use('/api/challenges', challengesRouter(validateJwt))
    this.app.use('/api/challengeoftheweek', challengeOfTheWeekRouter(validateJwt))

    if (this.environment === 'production') {
      this.app.use(express.static(path.join(__dirname, '..', 'client-app')))
      this.app.get('*', (_, res) => {
        res.sendFile(path.join(__dirname, '..', 'client-app', 'index.html'))
      })
    }
  }

  start(port) {
    this.app.listen(port, () => console.log(`Server started on port ${port}`))
  }
}

module.exports = {
  Server,
}
