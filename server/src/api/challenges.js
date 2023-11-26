const express = require('express')
const { check, validationResult } = require('express-validator')
const { newQuiz } = require('country-quiz')

const Challenge = require('../database/models/Challenge')
const User = require('../database/models/User')

function challengesRouter(validateJwt) {
  const router = express.Router()

  // Get challenge by id
  router.get('/:challengeId', validateJwt, async (req, res) => {
    try {
      // Test if challenge exists
      let challenge = await Challenge.findById(req.params.challengeId).populate('from to', 'username emoji')
      if (!challenge)
        return res.status(404).json({
          errors: [
            {
              param: 'challengeId',
              msg: 'There is no challenge with this id.',
            },
          ],
        })

      // Test if user is part of this challenge
      const userChallenged = req.userId === challenge.from.id.toString()
      const userWasChallenged = req.userId === challenge.to.id.toString()
      if (!userChallenged && !userWasChallenged)
        return res.status(401).json({
          errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }],
        })

      res.json(challenge)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Get challenges of logged in user
  router.get('/', validateJwt, async (req, res) => {
    try {
      // Get challenges by user id
      let challenges = await Challenge.find({
        $or: [{ from: req.userId }, { to: req.userId }],
      })
        .select('from to createdAt results')
        .sort({ createdAt: 'desc' })
        .limit(20)
        .populate('from to', 'username emoji')

      // Create response
      challenges = challenges.map(({ id, from, to, createdAt, results }) => {
        const challenge = { _id: id, createdAt }

        const userResult = results.find((result) => result.user.toString() === req.userId)

        // Set if user was challenged or user challenged someone
        if (from.id === req.userId) challenge.to = `${to.emoji}${to.username}`
        else if (to.id === req.userId) challenge.from = `${from.emoji}${from.username}`

        // Set status of the challenge
        if (results.length === 2) challenge.status = 'completed'
        else if (userResult) challenge.status = 'waiting'
        else challenge.status = 'new'

        // Return Points to show in dashboard
        if (challenge.status === 'completed') challenge.points = userResult.points

        return challenge
      })

      res.json(challenges)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  })

  // Create a new challenge
  router.post(
    '/',
    [validateJwt, [check('username', 'Please select a username to challenge.').not().isEmpty()]],
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
          return res.status(404).json({
            errors: [
              {
                param: 'username',
                msg: 'There is no user with this username.',
              },
            ],
          })

        const quiz = newQuiz('mixed', 10)

        const newChallenge = new Challenge({
          from: req.userId,
          to: challengedUser.id,
          ...quiz,
        })

        await newChallenge.save()

        const responseData = await Challenge.findById(newChallenge.id).populate('from to', 'username emoji')

        res.json(responseData)
      } catch (err) {
        console.error(err.message)
        res.status(500).send('Server Error')
      }
    },
  )

  // Submit answers to a challenge
  router.post(
    '/:challengeId',
    [validateJwt, [check('answers', 'Please provide answers to this challenge.').exists().isArray()]],
    async (req, res) => {
      const validationErrors = validationResult(req)
      if (!validationErrors.isEmpty()) {
        const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
        return res.status(400).json({ errors })
      }

      const { answers } = req.body

      try {
        // Test if challenge exists
        let challenge = await Challenge.findById(req.params.challengeId).populate('from to', 'username emoji')
        if (!challenge)
          return res.status(404).json({
            errors: [
              {
                param: 'challengeId',
                msg: 'There is no challenge with this id.',
              },
            ],
          })

        // Test if user is part of this challenge
        const userChallenged = req.userId === challenge.from.id.toString()
        const userWasChallenged = req.userId === challenge.to.id.toString()
        if (!userChallenged && !userWasChallenged)
          return res.status(401).json({
            errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }],
          })

        // Test if user has already submitted answers to this challenge
        const userAnswers = challenge.results.find((result) => result.user.toString() === req.userId)
        if (userAnswers)
          return res.status(400).json({
            errors: [
              {
                param: 'userId',
                msg: 'User already submitted answers to this challenge.',
              },
            ],
          })

        // Test if answers array is in correct format
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

        // Add answers to challenge answers
        challenge.results.push({ user: req.userId, result })

        // Give Points and clear up Document if challenge is completed (= both users have submitted answers)
        if (challenge.results.length === 2) {
          // Get Users from this challenge
          const userFrom = await User.findById(challenge.from.id)
          const userTo = await User.findById(challenge.to.id)

          // Both get +10 Points for completing the challenge
          let userFromPoints = 10
          let userToPoints = 10

          // Get results for both users
          const userFromAnswer = challenge.results.find((result) => result.user.toString() === userFrom.id)
          const userToAnswer = challenge.results.find((result) => result.user.toString() === userTo.id)

          // Calculate the number of correct answers for both users
          const userFromResult = userFromAnswer.result.filter((r) => r).length
          const userToResult = userToAnswer.result.filter((r) => r).length

          // The winner gets +5 points for every correct answer
          if (userFromResult > userToResult) userFromPoints += userFromResult * 5
          if (userToResult > userFromResult) userToPoints += userToResult * 5

          // If one or both users answered all questions correct, they get +25 points
          if (userFromResult === challenge.questions.length) userFromPoints += 25
          if (userToResult === challenge.questions.length) userToPoints += 25

          // Add points to users and save in db
          userFrom.points += userFromPoints
          userTo.points += userToPoints
          userFrom.save()
          userTo.save()

          // Add points to challenge document
          userFromAnswer.points = userFromPoints
          userToAnswer.points = userToPoints

          // Clean Up Challenge Document
          challenge.questions = undefined
          challenge.quizMode = undefined
        }

        // Save challenge to database
        await challenge.save()

        const response = {
          _id: challenge._id,
          from: challenge.from,
          to: challenge.to,
          results: challenge.results,
        }

        res.json(response)
      } catch (err) {
        console.error(err.message)
        if (err.kind === 'ObjectId')
          return res.status(404).json({
            errors: [
              {
                param: 'challengeId',
                msg: 'There is no challenge with this id.',
              },
            ],
          })
        res.status(500).send('Server Error')
      }
    },
  )

  return router
}

module.exports = { challengesRouter }
