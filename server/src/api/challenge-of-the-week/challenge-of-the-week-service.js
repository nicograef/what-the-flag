class ChallengeNotFoundError extends Error {}
class ChallengeAlreadyAnsweredError extends Error {}

class ChallengeOfTheWeekService {
  constructor(persistence) {
    this.persistence = persistence
  }

  async getChallenge(userId) {
    const challenge = await this.persistence.getCurrentChallenge()
    if (!challenge) throw new ChallengeNotFoundError()

    const userHasAnsweredChallenge = challenge.results.some((result) => result.user.toString() === userId)
    if (userHasAnsweredChallenge) return this.getLeaderboard()

    // Remove answers from questions because otherwise the user could cheat (see answers in frontend)
    const questions = challenge.questions.map(({ question, options, quizMode }) => ({
      question,
      options,
      quizMode,
    }))

    return { _id: challenge._id, questions }
  }

  async getLeaderboard() {
    const challenge = await this.persistence.getCurrentChallengeWithUsers()
    if (!challenge) throw new ChallengeNotFoundError()

    const leaderboard = challenge.results.sort((a, b) => b.points - a.points)

    const results = leaderboard.map(({ points, user: { username, emoji } }) => ({
      points,
      username,
      emoji,
    }))

    return {
      _id: challenge._id,
      results,
    }
  }

  async postAnswers(userId, answers) {
    const challenge = await this.persistence.getCurrentChallenge()
    if (!challenge) throw new ChallengeNotFoundError()

    const userHasAnsweredChallenge = challenge.results.some((result) => result.user.toString() === userId)
    if (userHasAnsweredChallenge) throw new ChallengeAlreadyAnsweredError()

    // Calculate result
    // Array with 1 for correct answers and 0 for wrong answers
    const result = answers.map((answer, index) => {
      if (answer === challenge.questions[index].answer) return 1
      else return 0
    })

    const points = result.filter((r) => r === 1).length

    await this.persistence.addUserPointsToChallenge(challenge._id, userId, points)

    // Calculate and add Points to User; 10 Points for every correct answer
    await this.persistence.updateUserPoints(userId, points * 10)

    return this.getLeaderboard()
  }
}

module.exports = { ChallengeOfTheWeekService, ChallengeNotFoundError, ChallengeAlreadyAnsweredError }
