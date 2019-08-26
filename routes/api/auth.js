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

// @route   GET api/auth
// @desc    Get logged in User
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password')
    res.json(user)
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   POST api/auth
// @desc    Authenticate (login) user and get token
// @access  Public
router.post(
  '/',
  [
    check('email', 'Please include a valid email.').isEmail(),
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
  ],
  async (req, res) => {
    // Check for errors
    const validationErrors = validationResult(req)
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
      return res.status(400).json({ errors })
    }

    const { email, password } = req.body

    try {
      // See if user exits
      let user = await User.findOne({ email })

      // Stop if there is no user with given email
      if (!user) res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] })

      // Check if password is correct
      const passwordIsCorrect = await bcrypt.compare(password, user.password)

      // Stop if password is incorrect
      if (!passwordIsCorrect) res.status(400).json({ errors: [{ msg: 'Invalid Credentials' }] })

      // Return JsonWebToken to further authenticate user
      const payload = { userId: user.id }
      const secret = config.get('jwtSecret')
      const token = jwt.sign(payload, secret, { expiresIn: '1d' })

      res.json({ token })

      // Return Error if something went wrong
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }
)

module.exports = router
