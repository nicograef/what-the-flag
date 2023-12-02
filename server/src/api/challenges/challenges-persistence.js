const Challenge = require('../../database/models/Challenge')
const User = require('../../database/models/User')

class ChallengesPersistence {
  async getChallenge(challengeId) {
    return Challenge.findById(challengeId).populate('from to', 'username emoji')
  }

  async getChallengesOfUser(userId) {
    return Challenge.find({
      $or: [{ from: userId }, { to: userId }],
    })
      .select('from to createdAt results')
      .sort({ createdAt: 'desc' })
      .limit(20)
      .populate('from to', 'username emoji')
  }

  async createChallenge(from, to, quizMode, questions) {
    return Challenge.create({ from, to, quizMode, questions })
  }

  async updateChallenge(challengeDoc) {
    return challengeDoc.save()
    // return Challenge.findOneAndUpdate({ _id: challenge.id }, challenge)
  }

  async getUserByUsername(username) {
    return User.findOne({ username })
  }

  async updateUserPoints(userId, newPoints) {
    const user = await User.findById(userId)
    user.points += newPoints
    user.save()
  }
}

module.exports = { ChallengesPersistence }
