const express = require('express')

const { ChallengesPersistence } = require('./challenges-persistence')
const { ChallengesService } = require('./challenges-service')
const { ChallengesController } = require('./challenges-controller')

function challengesRouter(jwtService) {
  const router = express.Router()

  const persistence = new ChallengesPersistence()
  const service = new ChallengesService(persistence)
  const controller = new ChallengesController(service)

  // all routes need authentication
  router.use(jwtService.validateJwt.bind(jwtService))

  // Get challenges of logged in user
  router.get('/', controller.getChallenges.bind(controller))

  // Create a new challenge
  router.post('/', controller.postChallenges.bind(controller))

  // Get challenge by id
  router.get('/:challengeId', controller.getChallenge.bind(controller))

  // Submit answers to a challenge
  router.post('/:challengeId', controller.postChallenge.bind(controller))

  return router
}

module.exports = { challengesRouter }
