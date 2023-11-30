const { Router } = require('express')

const { AuthController } = require('./auth-controller')
const { AuthService } = require('./auth-service')
const { AuthPersistence } = require('./auth-persistence')

function authRouter(jwtService, passwordService) {
  const router = Router()

  const persistence = new AuthPersistence()
  const service = new AuthService(persistence, jwtService, passwordService)
  const controller = new AuthController(service)

  router.get('/', jwtService.validateJwt.bind(jwtService), controller.getProfile.bind(controller))

  router.post('/', controller.postLogin.bind(controller))

  return router
}

module.exports = { authRouter }
