const { newQuiz } = require('country-quiz')

class ChallengeNotFoundError extends Error {}
class ChallengeNotBelongsToUserError extends Error {}
class ChallengeAlreadyAnsweredError extends Error {}
class UserNotFoundError extends Error {}

class ChallengesService {
  constructor(persistence) {
    this.persistence = persistence
  }

  async getChallengeByIdAndUser(challengeId, userId) {
    const challenge = await this.persistence.getChallenge(challengeId)
    if (!challenge) throw new ChallengeNotFoundError()

    const userChallenged = userId === challenge.from.id.toString()
    const userWasChallenged = userId === challenge.to.id.toString()
    if (!userChallenged && !userWasChallenged) throw new ChallengeNotBelongsToUserError()

    return challenge
  }

  async getChallengeByIdAndUserWithoutAnswers(challengeId, userId) {
    const challenge = await this.getChallengeByIdAndUser(challengeId, userId)

    // Remove answers from questions because otherwise the user could cheat (see answers in frontend)
    challenge.questions = challenge.questions.map(({ question, options, quizMode }) => ({
      question,
      options,
      quizMode,
    }))

    return challenge
  }

  async getAllChallengesOfUser(userId) {
    const challengesDb = await this.persistence.getChallengesOfUser(userId)

    const challenges = challengesDb.map(({ id, from, to, createdAt, results }) => {
      const challenge = { _id: id, createdAt }

      const userResult = results.find((result) => result.user.toString() === userId)

      // Set if user was challenged or user challenged someone
      if (from.id === userId) challenge.to = `${to.emoji}${to.username}`
      else if (to.id === userId) challenge.from = `${from.emoji}${from.username}`

      // Set status of the challenge
      if (results.length === 2) challenge.status = 'completed'
      else if (userResult) challenge.status = 'waiting'
      else challenge.status = 'new'

      // Return Points to show in dashboard
      if (challenge.status === 'completed') challenge.points = userResult.points

      return challenge
    })

    return challenges
  }

  async createChallenge(userId, challengedUsername) {
    const challengedUser = await this.persistence.getUserByUsername(challengedUsername)
    if (!challengedUser) throw new UserNotFoundError()

    const { quizMode, questions } = newQuiz('mixed', 10)

    const newChallenge = await this.persistence.createChallenge(userId, challengedUser.id, quizMode, questions)

    const challengeWithUsers = await this.persistence.getChallenge(newChallenge.id)

    // Remove answers from questions because otherwise the user could cheat (see answers in frontend)
    challengeWithUsers.questions = challengeWithUsers.questions.map(({ question, options, quizMode }) => ({
      question,
      options,
      quizMode,
    }))

    return challengeWithUsers
  }

  async submitAnswers(challengeId, userId, answers) {
    const challenge = await this.getChallengeByIdAndUser(challengeId, userId)

    // Test if user has already submitted answers to this challenge
    const userAnswers = challenge.results.find((result) => result.user.toString() === userId)
    if (userAnswers) throw new ChallengeAlreadyAnsweredError()

    // Calculate result
    // Array with 1 for correct answers and 0 for wrong answers
    const result = answers.map((answer, index) => {
      if (answer === challenge.questions[index].answer) return 1
      else return 0
    })

    // Add result to challenge
    challenge.results.push({ user: userId, result })

    // if both user have answered the challenge
    // calculate points for each users and save in db
    if (challenge.results.length === 2) {
      await this.calculatePointsUpdateUsersAndUpdateChallenge(challenge)
    }

    await this.persistence.updateChallenge(challenge)

    return {
      _id: challenge._id,
      from: challenge.from,
      to: challenge.to,
      results: challenge.results,
    }
  }

  /** @private */
  async calculatePointsUpdateUsersAndUpdateChallenge(challenge) {
    const userFromResult = challenge.results.find((result) => result.user.toString() === challenge.from.id)
    const userToResult = challenge.results.find((result) => result.user.toString() === challenge.to.id)

    const { userFromPoints, userToPoints } = this.calculatePoints(
      userFromResult,
      userToResult,
      challenge.questions.length,
    )

    await this.persistence.updateUserPoints(challenge.from.id, userFromPoints)
    await this.persistence.updateUserPoints(challenge.to.id, userToPoints)

    // Add points to challenge document
    userFromResult.points = userFromPoints
    userToResult.points = userToPoints
  }

  /** @private */
  calculatePoints(userFromResult, userToResult, numberOfQuestions) {
    // Calculate the number of correct answers for both users
    const userFromScore = userFromResult.result.filter((r) => r === 1).length
    const userToScore = userToResult.result.filter((r) => r === 1).length

    // Both get +10 Points for completing the challenge
    let userFromPoints = 10
    let userToPoints = 10

    // The winner gets +5 points for every correct answer
    if (userFromScore > userToScore) userFromPoints += userFromScore * 5
    if (userToScore > userFromScore) userToPoints += userToScore * 5

    // If one or both users answered all questions correct, they get +25 points
    if (userFromScore === numberOfQuestions) userFromPoints += 25
    if (userToScore === numberOfQuestions) userToPoints += 25

    return { userFromPoints, userToPoints }
  }
}

module.exports = {
  ChallengesService,
  ChallengeNotFoundError,
  ChallengeNotBelongsToUserError,
  ChallengeAlreadyAnsweredError,
  UserNotFoundError,
}
