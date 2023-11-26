const express = require('express')
const { check } = require('express-validator')

const { UsersController } = require('./users-controller')

function usersRouter(validateJwt) {
  const router = express.Router()
  const controller = new UsersController()

  router.get('/', validateJwt, controller.getAllUsers)

  router.post(
    '/',
    [
      check('username', 'Please enter a username with 4 or more characters.').isLength({ min: 4 }),
      check('email', 'Please enter a valid email.').isEmail(),
      check('password', 'Please enter a password with 6 or more characters.').isLength({ min: 6 }),
    ],
    controller.createUser,
  )

  return router
}

module.exports = { usersRouter }
