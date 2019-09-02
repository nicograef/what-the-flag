// Express Import
const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')

// Security Import
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const config = require('config')

// Import auth Middleware
const auth = require('../../middleware/auth')

// Database Model Import
const User = require('../../models/User')

// @route   Get api/users/:id
// @desc    Get User by Id
// @access  Private
router.get('/:userId', auth, async (req, res) => {
  try {
    // Get User from database
    const user = await User.findById(req.params.userId).select('username date')

    // Return 404 if user does not exist
    if (!user) return res.status(404).json({ msg: 'User not found.' })

    // Return user profile if exists
    res.json(user)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   Get api/users
// @desc    Get all users
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Get User from database
    const users = await User.find()
      .select('username emoji points')
      .sort({ points: 'desc' })

    // Return user profile if exists
    res.json(users)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   POST api/users
// @desc    Register user
// @access  Public
router.post(
  '/',
  [
    check('username', 'Please enter a username with 4 or more characters.').isLength({ min: 4 }),
    check('email', 'Please enter a valid email.').isEmail(),
    check('password', 'Please enter a password with 6 or more characters.').isLength({ min: 6 })
  ],
  async (req, res) => {
    // Check for errors
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
        res
          .status(400)
          .json({ errors: [{ param: 'username', msg: 'This username already exists.' }] })

      // See if user with given email already exits
      user = await User.findOne({ email })
      if (user)
        res
          .status(400)
          .json({ errors: [{ param: 'email', msg: 'A user with this email already exists.' }] })

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
        '😑'
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
      const secret = config.get('jwtSecret')
      const token = jwt.sign(payload, secret, { expiresIn: '1d' })

      res.status(201).json({ token })

      // Return Error if something went wrong
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }
)

module.exports = router
