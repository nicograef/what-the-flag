const express = require('express')
const { check, validationResult } = require('express-validator')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const User = require('../database/models/User')

function usersRouter(validateJwt) {
  const router = express.Router()

  // Get User by Id
  router.get('/:userId', validateJwt, async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select('username date')

      if (!user) return res.status(404).json({ msg: 'User not found.' })

      res.json(user)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Get all users
  router.get('/', validateJwt, async (_, res) => {
    try {
      const users = await User.find().select('username emoji points').sort({ points: 'desc' })

      res.json(users)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Register user
  router.post(
    '/',
    [
      check('username', 'Please enter a username with 4 or more characters.').isLength({ min: 4 }),
      check('email', 'Please enter a valid email.').isEmail(),
      check('password', 'Please enter a password with 6 or more characters.').isLength({ min: 6 }),
    ],
    async (req, res) => {
      const validationErrors = validationResult(req)
      if (!validationErrors.isEmpty()) {
        const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
        return res.status(400).json({ errors })
      }

      const { username, email, password } = req.body

      try {
        // Test if username exits / is free to take
        let user = await User.findOne({ username })
        if (user)
          res.status(400).json({
            errors: [{ param: 'username', msg: 'This username already exists.' }],
          })

        // See if user with given email already exits
        user = await User.findOne({ email })
        if (user)
          res.status(400).json({
            errors: [{ param: 'email', msg: 'A user with this email already exists.' }],
          })

        // Select random emoji for user
        const emojis = [
          '😄',
          '😃',
          '😀',
          '😊',
          '😉',
          '😍',
          '😘',
          '😚',
          '😗',
          '😙',
          '😜',
          '😝',
          '😛',
          '😳',
          '😁',
          '😔',
          '😌',
          '😒',
          '😞',
          '😣',
          '😢',
          '😂',
          '😭',
          '😪',
          '😥',
          '😰',
          '😅',
          '😓',
          '😩',
          '😫',
          '😨',
          '😱',
          '😠',
          '😡',
          '😤',
          '😖',
          '😆',
          '😋',
          '😷',
          '😎',
          '😴',
          '😵',
          '😲',
          '😟',
          '😦',
          '😧',
          '😈',
          '👿',
          '😮',
          '😬',
          '😐',
          '😕',
          '😯',
          '😶',
          '😇',
          '😏',
          '😑',
        ]
        const randomIndex = Math.floor(Math.random() * emojis.length)
        const emoji = emojis[randomIndex]

        // Create new user instance
        user = new User({ username, email, password, emoji })

        // Encrypt password
        const salt = await bcrypt.genSalt(10)
        user.password = await bcrypt.hash(password, salt)

        // Save user to database
        await user.save()

        // Return JsonWebToken to further authenticate user
        const payload = { userId: user.id }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
          expiresIn: '1d',
        })

        res.status(201).json({ token })
      } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
      }
    },
  )

  return router
}

module.exports = { usersRouter }
