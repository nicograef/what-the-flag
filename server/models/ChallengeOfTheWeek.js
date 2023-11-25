const mongoose = require('mongoose')
const Schema = mongoose.Schema

const ChallengeOfTheWeekSchema = new Schema({
  results: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      points: {
        type: Number,
        required: true,
      },
    },
  ],
  questions: {
    type: Array,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
})

module.exports = mongoose.model('ChallengeOfTheWeek', ChallengeOfTheWeekSchema)
