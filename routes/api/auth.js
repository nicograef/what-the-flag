// Express Import
const express = require('express')
const router = express.Router()
const { check, validationResult } = require('express-validator')

// Security Import
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

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
    check('username', 'Please enter your username.')
      .not()
      .isEmpty(),
    // .not()
    // .isEmail(),
    // check('email', 'Please include a valid email.').isEmail() ,
    check('password', 'Please enter a password with 6 or more characters').isLength({ min: 6 })
  ],
  async (req, res) => {
    // Check for errors
    const validationErrors = validationResult(req)
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
      return res.status(400).json({ errors })
    }

    const { username, password } = req.body

    try {
      // See if user exits
      let user = await User.findOne({ username })

      // Stop if there is no user with given username
      if (!user)
        return res.status(400).json({
          errors: [
            { param: 'username', msg: 'Username or Password is not correct.' },
            { param: 'password', msg: 'Username or Password is not correct.' }
          ]
        })

      // Check if password is correct
      const passwordIsCorrect = await bcrypt.compare(password, user.password)

      // Stop if password is incorrect
      if (!passwordIsCorrect)
        return res.status(400).json({
          errors: [
            { param: 'username', msg: 'Username or Password is not correct.' },
            { param: 'password', msg: 'Username or Password is not correct.' }
          ]
        })

      // Return JsonWebToken to further authenticate user
      const payload = { userId: user.id }
      const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' })

      res.json({ token })

      // Return Error if something went wrong
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }
)

module.exports = router
