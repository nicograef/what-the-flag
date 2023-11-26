const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const User = require('../../database/models/User')
const { getRandomEmoji } = require('./get-random-emoji')

class UsernameExistsError extends Error {}
class EmailExistsError extends Error {}

class UsersPersistence {
  async getAllUsersSortedByPoints() {
    const users = await User.find().select('username emoji points').sort({ points: 'desc' })
    return users
  }

  async createUser(username, email, password) {
    const userWithUsername = await User.findOne({ username })
    if (userWithUsername) throw new UsernameExistsError()

    const userWithEmail = await User.findOne({ email })
    if (userWithEmail) throw new EmailExistsError()

    const emoji = getRandomEmoji()
    const newUser = new User({ username, email, password, emoji })

    const salt = await bcrypt.genSalt(10)
    newUser.password = await bcrypt.hash(password, salt)

    await newUser.save()

    const payload = { userId: newUser.id }
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '1d',
    })

    return token
  }
}

module.exports = { UsersPersistence, UsernameExistsError, EmailExistsError }
