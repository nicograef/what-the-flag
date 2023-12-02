const express = require('express')

const { ChallengesPersistence } = require('./challenges-persistence')
const { ChallengesService } = require('./challenges-service')
const { ChallengesController } = require('./challenges-controller')

function challengesRouter(jwtService) {
  const router = express.Router()

  const persistence = new ChallengesPersistence()
  const service = new ChallengesService(persistence)
  const controller = new ChallengesController(service)

  // Get challenges of logged in user
  router.get('/', jwtService.validateJwt.bind(jwtService), controller.getChallenges.bind(controller))

  // Create a new challenge
  router.post('/', jwtService.validateJwt.bind(jwtService), controller.postChallenges.bind(controller))

  // Get challenge by id
  router.get('/:challengeId', jwtService.validateJwt.bind(jwtService), controller.getChallenge.bind(controller))

  // Submit answers to a challenge
  router.post('/:challengeId', jwtService.validateJwt.bind(jwtService), controller.postChallenge.bind(controller))

  return router
}

module.exports = { challengesRouter }
