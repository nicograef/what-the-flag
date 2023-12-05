const { newQuiz } = require('country-quiz')

const { Database } = require('../database/database')
const ChallengeOfTheWeek = require('../database/models/ChallengeOfTheWeek')

async function createChallengeOfTheWeek() {
  const MONGODB_URI = process.env.MONGODB_URI

  const database = new Database(MONGODB_URI)
  await database.connect()

  const quiz = newQuiz('mixed', 20)

  const newChallenge = await ChallengeOfTheWeek.create({
    ...quiz,
  })

  console.log('New Challenge of the week created successfully!')
  console.log('Challenge ID:', newChallenge._id)

  process.exit(0)
}

createChallengeOfTheWeek()
