const { Router } = require('express')

const { UsersController } = require('./users-controller')
const { UsersService } = require('./users-service')
const { UsersPersistence } = require('./users-persistence')

function usersRouter(jwtService) {
  const router = Router()
  const persistence = new UsersPersistence()
  const service = new UsersService(persistence, jwtService)
  const controller = new UsersController(service)

  router.get('/', jwtService.validateJwt.bind(jwtService), controller.getUsers.bind(controller))

  router.post('/', controller.postUser.bind(controller))

  return router
}

module.exports = { usersRouter }
