const { ChallengeNotFoundError, ChallengeAlreadyAnsweredError } = require('./challenge-of-the-week-service')

class ChallengeOfTheWeekController {
  constructor(service) {
    this.service = service
  }

  async getChallenge(req, res) {
    try {
      const response = await this.service.getChallenge(req.userId)

      return res.json(response)
    } catch (err) {
      console.error(err.message)

      if (err instanceof ChallengeNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'challenge',
              msg: 'There is no challenge for this the week.',
            },
          ],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }

  async getLeaderboard(_, res) {
    try {
      const response = await this.service.getLeaderboard()

      res.json(response)
    } catch (err) {
      console.error(err.message)

      if (err instanceof ChallengeNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'challenge',
              msg: 'There is no challenge for this the week.',
            },
          ],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }

  async postAnswers(req, res) {
    if (!req.body.answers || !Array.isArray(req.body.answers)) {
      res.status(400).json({ errors: [{ param: 'answers', msg: 'Please provide answers to this challenge.' }] })
      return
    }

    try {
      const response = await this.service.postAnswers(req.userId, req.body.answers)

      res.json(response)
    } catch (err) {
      console.error(err.message)

      if (err instanceof ChallengeNotFoundError) {
        res.status(404).json({
          errors: [
            {
              param: 'challenge',
              msg: 'There is no challenge for this the week.',
            },
          ],
        })
      } else if (err instanceof ChallengeAlreadyAnsweredError) {
        res.status(400).json({
          errors: [
            {
              param: 'challenge',
              msg: 'User already answered this challenge.',
            },
          ],
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }
}

module.exports = { ChallengeOfTheWeekController }
