const express = require('express')
const bcrypt = require('bcrypt')

const User = require('../database/models/User')

function authRouter(jwtService) {
  const router = express.Router()

  router.get('/', jwtService.validateJwt.bind(jwtService), async (req, res) => {
    try {
      const user = await User.findById(req.userId).select('-password')
      res.json(user)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  router.post('/', async (req, res) => {
    if (!req.body.username || req.body.username.length < 4) {
      res.status(400).json({ error: { param: 'username', msg: 'Please enter a username with 4 or more characters.' } })
      return
    }

    if (!req.body.password || req.body.password.length < 6) {
      res.status(400).json({ error: { param: 'password', msg: 'Please enter a password with 6 or more characters.' } })
      return
    }

    try {
      const { username, password } = req.body
      let user = await User.findOne({ username })

      // Stop if there is no user with given username
      if (!user)
        return res.status(400).json({
          error: { param: 'username', msg: 'Username or Password is not correct.' },
        })

      const passwordIsCorrect = await bcrypt.compare(password, user.password)

      if (!passwordIsCorrect)
        return res.status(400).json({
          error: { param: 'username', msg: 'Username or Password is not correct.' },
        })

      const token = jwtService.createNewToken({ userId: user.id })

      res.json({ token })
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  return router
}

module.exports = { authRouter }
