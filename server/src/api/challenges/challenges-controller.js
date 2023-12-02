const {
  ChallengeNotFoundError,
  ChallengeAlreadyAnsweredError,
  ChallengeNotBelongsToUserError,
  UserNotFoundError,
} = require('./challenges-service')

class ChallengesController {
  constructor(service) {
    this.service = service
  }

  // Get challenge by id
  async getChallenge(req, res) {
    try {
      const challenge = await this.service.getChallengeByIdAndUser(req.params.challengeId, req.userId)

      res.json(challenge)
    } catch (err) {
      console.error(err.message)

      if (err instanceof ChallengeNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'challengeId',
              msg: 'There is no challenge with this id.',
            },
          ],
        })
      } else if (err instanceof ChallengeNotBelongsToUserError) {
        res.status(401).json({
          errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }

  // Get challenges of logged in user
  async getChallenges(req, res) {
    try {
      const challenges = await this.service.getAllChallengesOfUser(req.userId)

      res.json(challenges)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }

  // Create a new challenge
  async postChallenges(req, res) {
    if (!req.body.username) {
      res.status(400).json({ errors: [{ param: 'username', msg: 'Please select a username to challenge.' }] })
      return
    }

    try {
      const challengeWithUsers = await this.service.createChallenge(req.userId, req.body.username)

      res.json(challengeWithUsers)
    } catch (err) {
      console.error(err.message)

      if (err instanceof UserNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'username',
              msg: 'There is no user with this username.',
            },
          ],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }

  // Submit answers to a challenge
  async postChallenge(req, res) {
    if (!req.body.answers) {
      res.status(400).json({ errors: [{ param: 'answers', msg: 'Please provide answers to this challenge.' }] })
      return
    }

    try {
      const response = await this.service.submitAnswers(req.params.challengeId, req.userId, req.body.answers)

      res.json(response)
    } catch (err) {
      console.error(err.message)

      if (err instanceof ChallengeNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'challengeId',
              msg: 'There is no challenge with this id.',
            },
          ],
        })
      } else if (err instanceof ChallengeAlreadyAnsweredError) {
        res.status(400).json({
          errors: [
            {
              param: 'userId',
              msg: 'User already submitted answers to this challenge.',
            },
          ],
        })
      } else if (err instanceof ChallengeNotBelongsToUserError) {
        res.status(401).json({
          errors: [{ param: 'userId', msg: 'You are not part of this challenge.' }],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }
}

module.exports = { ChallengesController }
