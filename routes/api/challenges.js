// Express Import
const express = require('express')
const { check, validationResult } = require('express-validator')
const router = express.Router()

const auth = require('../../middleware/auth')

// Import Country Quiz
const { newQuiz } = require('country-quiz')

const Challenge = require('../../models/Challenge')
const User = require('../../models/User')

// @route   GET api/challenges/:challengeId
// @desc    Get challenge by id
// @access  Private
router.get('/:challengeId', auth, async (req, res) => {
  try {
    // Test if challenge exists
    let challenge = await Challenge.findById(req.params.challengeId).populate(
      'from to',
      'username emoji'
    )
    if (!challenge)
      return res
        .status(404)
        .json({ errors: [{ param: 'challengeId', msg: 'There is no challenge with this id.' }] })

    // Test if user is part of this challenge
    const userChallenged = req.userId === challenge.from.id.toString()
    const userWasChallenged = req.userId === challenge.to.id.toString()
    if (!userChallenged && !userWasChallenged)
      return res
        .status(401)
        .json({ errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }] })

    // Return challenge
    res.json(challenge)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   GET api/challenges
// @desc    Get challenges of logged in user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Get challenges by user id
    let challenges = await Challenge.find(
      { $or: [{ from: req.userId }, { to: req.userId }] },
      'from to createdAt answers',
      {
        sort: { createdAt: 'desc' },
        limit: 20
      }
    ).populate('from to', 'username emoji')

    // Clean up response
    challenges = challenges.map(({ id, from, to, createdAt, answers }) => {
      const challenge = { _id: id, createdAt }

      // Set if user was challenged or user challenged someone
      if (from.id === req.userId) challenge.to = `${to.emoji}${to.username}`
      else if (to.id === req.userId) challenge.from = `${from.emoji}${from.username}`

      // Calculate and set status of the challenge
      if (answers.length === 2) challenge.status = 'completed'
      else if (answers.find(answer => answer.user.toString() === req.userId))
        challenge.status = 'waiting'
      else challenge.status = 'new'

      return challenge
    })

    // Return challenge
    res.json(challenges)

    // Return error if there is
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

// @route   POST api/challenges
// @desc    Create a new challenge
// @access  Private
router.post(
  '/',
  [
    auth,
    [
      check('username', 'Please select a username to challenge.')
        .not()
        .isEmpty()
    ]
  ],
  async (req, res) => {
    // Check for errors
    const validationErrors = validationResult(req)
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
      return res.status(400).json({ errors })
    }

    // This is the challenged user
    const { username } = req.body

    try {
      // Test if username exists
      let challengedUser = await User.findOne({ username })
      if (!challengedUser)
        return res
          .status(404)
          .json({ errors: [{ param: 'username', msg: 'There is no user with this username.' }] })

      // Create a new Quiz
      const quiz = newQuiz('flag-to-country', 10)

      // Create a new Challenge
      const newChallenge = new Challenge({
        from: req.userId,
        to: challengedUser.id,
        ...quiz
      })

      // Save challenge to database
      await newChallenge.save()

      const responseData = await Challenge.findById(newChallenge.id).populate(
        'from to',
        'username emoji'
      )

      // Return challenge
      res.json(responseData)

      // Return error if there is
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }
)

// @route   POST api/challenges/:challenge_id
// @desc    Submit answers to a challenge
// @access  Private
router.post(
  '/:challengeId',
  [
    auth,
    [
      check('answers', 'Please provide answers to this challenge.')
        .not()
        .isEmpty(),
      check('answers', 'Please provide the answers in an array.').isArray()
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
      // Test if challenge exists
      let challenge = await Challenge.findById(req.params.challengeId).populate(
        'from to',
        'username emoji'
      )
      if (!challenge)
        return res
          .status(404)
          .json({ errors: [{ param: 'challengeId', msg: 'There is no challenge with this id.' }] })

      // Test if user is part of this challenge
      const userChallenged = req.userId === challenge.from.id.toString()
      const userWasChallenged = req.userId === challenge.to.id.toString()
      if (!userChallenged && !userWasChallenged)
        return res
          .status(401)
          .json({ errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }] })

      // Test if user has already submitted answers to this challenge
      const userAnswers = challenge.answers.find(answer => answer.user.toString() === req.userId)
      if (userAnswers)
        return res.status(400).json({
          errors: [{ param: 'userId', msg: 'User already submitted answers to this challenge.' }]
        })

      // Test if answers array is in correct format
      if (answers.length !== challenge.questions.length)
        return res
          .status(400)
          .json({ errors: [{ param: 'answers', msg: 'There are too many or too few answers.' }] })

      // Calculate result
      const result = answers.map((answer, index) => answer === challenge.questions[index].answer)

      // Add answers to challenge answers
      challenge.answers.push({ user: req.userId, answers, result })

      // Save challenge to database
      await challenge.save()

      // Process User Points if both users have submitted answers = challenge completed
      if (challenge.answers.length === 2) {
        // Get Users from this challenge
        const userFrom = await User.findById(challenge.from.id)
        const userTo = await User.findById(challenge.to.id)

        // Both get +10 Points for completing the challenge
        userFrom.points = userFrom.points + 10
        userTo.points = userTo.points + 10

        // @todo give winner extra +10 Points

        userFrom.save()
        userTo.save()
      }

      // Return challenge
      res.json(challenge)

      // Return error if there is
    } catch (err) {
      console.error(err.message)
      if (err.kind === 'ObjectId')
        return res
          .status(404)
          .json({ errors: [{ param: 'challengeId', msg: 'There is no challenge with this id.' }] })
      res.status(500).send('Server Error')
    }
  }
)

module.exports = router
