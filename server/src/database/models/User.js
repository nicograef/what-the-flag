const mongoose = require('mongoose')
const Schema = mongoose.Schema

const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    default: '😊',
    required: true,
  },
  points: {
    type: Number,
    default: 0,
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
    immutable: true,
  },
})

module.exports = mongoose.model('User', UserSchema)
