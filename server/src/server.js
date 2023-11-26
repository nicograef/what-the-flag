const path = require('path')
const express = require('express')

const { usersRouter } = require('./api/users')
const { authRouter } = require('./api/auth')
const { challengesRouter } = require('./api/challenges')
const { challengeOfTheWeekRouter } = require('./api/challengeoftheweek')

class Server {
  constructor(jwtMiddleware) {
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

    this.app.use(express.static(path.join(__dirname, '..', 'client-app')))
  }

  start(port) {
    this.app.listen(port, () => console.log(`Server started on port ${port}`))
  }
}

module.exports = {
  Server,
}
