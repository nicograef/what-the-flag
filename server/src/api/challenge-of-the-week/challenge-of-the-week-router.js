const express = require('express')

const { ChallengeOfTheWeekService } = require('./challenge-of-the-week-service')
const { ChallengeOfTheWeekController } = require('./challenge-of-the-week-controller')
const { ChallengeOfTheWeekPersistence } = require('./challenge-of-the-week-persistence')

function challengeOfTheWeekRouter(jwtService) {
  const router = express.Router()

  const persistence = new ChallengeOfTheWeekPersistence()
  const service = new ChallengeOfTheWeekService(persistence)
  const controller = new ChallengeOfTheWeekController(service)

  // all routes need authentication
  router.use(jwtService.validateJwt.bind(jwtService))

  // GET challenge of the week
  router.get('/', controller.getChallenge.bind(controller))

  // Submit answers to current challenge of the week
  router.post('/', controller.postAnswers.bind(controller))

  // Get leaderboard of current challenge of the week
  router.get('/leaderboard', controller.getLeaderboard.bind(controller))

  return router
}

module.exports = { challengeOfTheWeekRouter }
