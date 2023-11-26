const express = require('express')
const { check, validationResult } = require('express-validator')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const User = require('../database/models/User')

function authRouter(validateJwt) {
  const router = express.Router()

  router.get('/', validateJwt, async (req, res) => {
    try {
      const user = await User.findById(req.userId).select('-password')
      res.json(user)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  router.post(
    '/',
    [
      check('username', 'Please enter your username.').not().isEmpty(),
      check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 }),
    ],
    async (req, res) => {
      const validationErrors = validationResult(req)
      if (!validationErrors.isEmpty()) {
        const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
        return res.status(400).json({ errors })
      }

      const { username, password } = req.body

      try {
        let user = await User.findOne({ username })

        // Stop if there is no user with given username
        if (!user)
          return res.status(400).json({
            errors: [
              { param: 'username', msg: 'Username or Password is not correct.' },
              { param: 'password', msg: 'Username or Password is not correct.' },
            ],
          })

        const passwordIsCorrect = await bcrypt.compare(password, user.password)

        // Stop if password is incorrect
        if (!passwordIsCorrect)
          return res.status(400).json({
            errors: [
              { param: 'username', msg: 'Username or Password is not correct.' },
              { param: 'password', msg: 'Username or Password is not correct.' },
            ],
          })

        // Return JsonWebToken to further authenticate user
        const payload = { userId: user.id }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
          expiresIn: '7d',
        })

        res.json({ token })
      } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
      }
    },
  )

  return router
}

module.exports = { authRouter }
