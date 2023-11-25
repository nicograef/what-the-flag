// Mongoose
const connectDB = require("./db");
const ChallengeOfTheWeek = require("../models/ChallengeOfTheWeek");

// Import Country Quiz
const { newQuiz } = require("country-quiz");

async function createChallengeOfTheWeek() {
  await connectDB();
  const quiz = newQuiz("mixed", 20);

  // Create a new Challenge of the Week
  const newChallenge = new ChallengeOfTheWeek({
    ...quiz,
  });

  // Save challenge to database
  await newChallenge.save();
  console.log(newChallenge);

  process.exit();
}

createChallengeOfTheWeek();
