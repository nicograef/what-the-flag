const express = require('express')
const { check, validationResult } = require('express-validator')

const ChallengeOfTheWeek = require('../database/models/ChallengeOfTheWeek')
const User = require('../database/models/User')

function challengeOfTheWeekRouter(validateJwt) {
  const router = express.Router()

  // GET challenge of the week
  router.get('/', validateJwt, async (req, res) => {
    try {
      let challenge = await ChallengeOfTheWeek.findOne().sort({
        createdAt: 'desc',
      })

      if (!challenge)
        return res.status(404).json({
          errors: [
            {
              param: 'challenge',
              msg: 'There is no challenge for this the week.',
            },
          ],
        })

      // Test if user has already submitted answers to this challenge
      const userPoints = challenge.results.find((result) => result.user.toString() === req.userId)

      if (userPoints) {
        // Populate with username and emoji to create respond for frontend
        challenge = await ChallengeOfTheWeek.populate(challenge, {
          path: 'results.user',
          select: 'username emoji',
          model: 'User',
        })

        const leaderboard = challenge.results.sort((a, b) => b.points - a.points)

        const response = {
          _id: challenge._id,
          results: leaderboard.map(({ points, user: { username, emoji } }) => ({
            points,
            username,
            emoji,
          })),
        }

        // Return leaderboard
        return res.json(response)
      }

      // Return challenge
      res.json({ _id: challenge._id, questions: challenge.questions })

      // Return error if there is
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Get leaderboard if current challenge of the week
  router.get('/leaderboard', validateJwt, async (req, res) => {
    try {
      // Test if challenge exists
      let challenge = await ChallengeOfTheWeek.findOne()
        .sort({ createdAt: 'desc' })
        .select('results')
        .populate('results.user', 'username emoji')

      if (!challenge)
        return res.status(404).json({
          errors: [
            {
              param: 'challenge',
              msg: 'There is no challenge for this the week.',
            },
          ],
        })

      const leaderboard = challenge.results.sort((a, b) => b.points - a.points)

      const response = {
        _id: challenge._id,
        results: leaderboard.map(({ points, user: { username, emoji } }) => ({
          points,
          username,
          emoji,
        })),
      }

      res.json(response)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Submit answers to current challenge of the week
  router.post(
    '/',
    [validateJwt, [check('answers', 'Please provide answers to this challenge.').exists().isArray()]],
    async (req, res) => {
      const validationErrors = validationResult(req)
      if (!validationErrors.isEmpty()) {
        const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
        return res.status(400).json({ errors })
      }

      try {
        // Get latest challenge of the week
        let challenge = await ChallengeOfTheWeek.findOne().sort({ createdAt: 'desc' }).populate()

        // Check challenge exists
        if (!challenge)
          return res.status(404).json({
            errors: [
              {
                param: 'challenge',
                msg: 'There is no challenge for this the week.',
              },
            ],
          })

        // Test if user has already submitted answers to this challenge
        const userPoints = challenge.results.find((result) => result.user.toString() === req.userId)
        if (userPoints)
          return res.status(400).json({
            errors: [
              {
                param: 'userId',
                msg: 'User already submitted answers to this challenge.',
              },
            ],
          })

        // Test if answers array is in correct format
        const { answers } = req.body
        if (answers.length !== challenge.questions.length)
          return res.status(400).json({
            errors: [
              {
                param: 'answers',
                msg: 'There are too many or too few answers.',
              },
            ],
          })

        // Calculate result
        const result = answers.map((answer, index) => (answer === challenge.questions[index].answer ? 1 : 0))

        // Count points = correct answers
        const points = result.filter((r) => r).length

        // Add answers to challenge answers
        challenge.results.push({ user: req.userId, points })

        // Save challenge to database
        await challenge.save()

        // Calculate and add Points to User; 10 Points for every correct answer
        const user = await User.findById(req.userId)
        user.points += points * 10
        user.save()

        // Populate with username and emoji to create respond for frontend
        challenge = await ChallengeOfTheWeek.populate(challenge, {
          path: 'results.user',
          select: 'username emoji',
          model: 'User',
        })

        const leaderboard = challenge.results.sort((a, b) => b.points - a.points)

        const response = {
          _id: challenge._id,
          results: leaderboard.map(({ points, user: { username, emoji } }) => ({
            points,
            username,
            emoji,
          })),
        }

        res.json(response)
      } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
      }
    },
  )

  return router
}

module.exports = { challengeOfTheWeekRouter }
