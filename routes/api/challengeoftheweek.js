// Express Import
const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()

const auth = require('../../middleware/auth')

// Import Country Quiz
const { newQuiz } = require('country-quiz')

const ChallengeOfTheWeek = require('../../models/ChallengeOfTheWeek')
const User = require('../../models/User')

// @route   GET api/challengeoftheweek
// @desc    Get current challenge of the week
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Test if challenge exists
    let challenge = await ChallengeOfTheWeek.findOne({}, 'questions', {
      sort: { createdAt: 'desc' }
    })

    if (!challenge)
      return res
        .status(404)
        .json({ errors: [{ param: 'challenge', msg: 'There is no challenge for this the week.' }] })

    // Return challenge
    res.json(challenge)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   GET api/challengeoftheweek
// @desc    Get leaderboard if current challenge of the week
// @access  Private
router.get('/leaderboard', auth, async (req, res) => {
  try {
    // Test if challenge exists
    let challenge = await ChallengeOfTheWeek.findOne({}, 'points', {
      sort: { createdAt: 'desc' }
    })

    if (!challenge)
      return res
        .status(404)
        .json({ errors: [{ param: 'challenge', msg: 'There is no challenge for this the week.' }] })

    const leaderboard = challenge.points.sort((a, b) => b.points - a.points)

    // Return challenge
    res.json(leaderboard)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   POST api/challengeoftheweek
// @desc    Submit answers to current challenge of the week
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('answers', 'Please provide answers to this challenge.')
        .exists()
        .isArray()
    ]
  ],
  async (req, res) => {
    // Check for errors
    const validationErrors = validationResult(req)
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
      return res.status(400).json({ errors })
    }

    const { answers } = req.body

    try {
      // Get latest challenge of the week
      let challenge = await ChallengeOfTheWeek.findOne(
        {},
        {},
        {
          sort: { createdAt: 'desc' }
        }
      ).populate('points.user', 'username emoji')

      // Check challenge exists
      if (!challenge)
        return res.status(404).json({
          errors: [{ param: 'challenge', msg: 'There is no challenge for this the week.' }]
        })

      // Test if user has already submitted answers to this challenge
      const userPoints = challenge.points.find(points => points.user._id.toString() === req.userId)
      if (userPoints)
        return res.status(400).json({
          errors: [{ param: 'userId', msg: 'User already submitted answers to this challenge.' }]
        })

      // Test if answers array is in correct format
      if (answers.length !== challenge.questions.length)
        return res
          .status(400)
          .json({ errors: [{ param: 'answers', msg: 'There are too many or too few answers.' }] })

      // Calculate result
      const result = answers.map((answer, index) =>
        answer === challenge.questions[index].answer ? 1 : 0
      )

      // Count points = correct answers
      const points = result.filter(r => r).length

      // Add answers to challenge answers
      challenge.points.push({ user: req.userId, points })

      // Save challenge to database
      await challenge.save()

      const response = {
        _id: challenge._id,
        points: challenge.points
      }

      // Return challenge
      res.json(response)

      // Return error if there is
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }
)

module.exports = router
