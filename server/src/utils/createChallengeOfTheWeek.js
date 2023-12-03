const { newQuiz } = require('country-quiz')

const { Database } = require('../database/database')
const ChallengeOfTheWeek = require('../database/models/ChallengeOfTheWeek')

async function createChallengeOfTheWeek() {
  const MONGODB_URI = process.env.MONGODB_URI

  const database = new Database(MONGODB_URI)
  await database.connect()

  const quiz = newQuiz('mixed', 20)

  const newChallenge = new ChallengeOfTheWeek({
    ...quiz,
  })

  await newChallenge.save()
}

createChallengeOfTheWeek()
