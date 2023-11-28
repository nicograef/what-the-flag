const path = require('path')
const express = require('express')

const { usersRouter } = require('./api/users/users-router')
const { authRouter } = require('./api/auth')
const { challengesRouter } = require('./api/challenges')
const { challengeOfTheWeekRouter } = require('./api/challengeoftheweek')

class Server {
  constructor(jwtService) {
    this.jwtService = jwtService
    this.app = express()
  }

  init() {
    this.app.use(express.json())

    this.app.use('/api/users', usersRouter(this.jwtService))
    this.app.use('/api/auth', authRouter(this.jwtService))
    this.app.use('/api/challenges', challengesRouter(this.jwtService))
    this.app.use('/api/challengeoftheweek', challengeOfTheWeekRouter(this.jwtService))

    this.app.use(express.static(path.join(__dirname, '..', 'client-app')))
    this.app.get('*', (_, res) => {
      res.sendFile(path.join(__dirname, '..', 'client-app', 'index.html'))
    })
  }

  start(port) {
    this.app.listen(port, () => console.log(`Server started on port ${port}`))
  }
}

module.exports = {
  Server,
}
