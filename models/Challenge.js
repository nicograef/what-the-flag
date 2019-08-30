const mongoose = require('mongoose')
const Schema = mongoose.Schema

const ChallengeSchema = new Schema({
  from: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  to: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  results: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      result: {
        type: Array,
        required: true
      },
      points: {
        type: Number
      }
    }
  ],
  questions: {
    type: Array
    // required: true
  },
  quizMode: {
    type: String
    // required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  }
})

module.exports = mongoose.model('Challenge', ChallengeSchema)
