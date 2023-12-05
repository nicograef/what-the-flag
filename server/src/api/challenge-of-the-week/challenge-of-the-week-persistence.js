const ChallengeOfTheWeek = require('../../database/models/ChallengeOfTheWeek')
const User = require('../../database/models/User')

class ChallengeOfTheWeekPersistence {
  async getCurrentChallenge() {
    return ChallengeOfTheWeek.findOne().sort({ createdAt: 'desc' })
  }

  async getCurrentChallengeWithUsers() {
    return await ChallengeOfTheWeek.findOne().sort({ createdAt: 'desc' }).populate('results.user', 'username emoji')
  }

  async addUserPointsToChallenge(challengeId, userId, points) {
    await ChallengeOfTheWeek.updateOne(
      { _id: challengeId },
      {
        $push: {
          results: { user: userId, points },
        },
      },
    )
  }

  async updateUserPoints(userId, newPoints) {
    const user = await User.findById(userId)
    user.points += newPoints
    await user.save()
  }
}

module.exports = { ChallengeOfTheWeekPersistence }
