const User = require('../../database/models/User')

class UsernameExistsError extends Error {}
class EmailExistsError extends Error {}

class UsersPersistence {
  async getAllUsersSortedByPoints() {
    const users = await User.find().select('username emoji points').sort({ points: 'desc' })
    return users
  }

  async createUser(username, email, passwordHash, emoji) {
    const userWithUsername = await User.findOne({ username })
    if (userWithUsername) throw new UsernameExistsError()

    const userWithEmail = await User.findOne({ email })
    if (userWithEmail) throw new EmailExistsError()

    const userDoc = await User.create({ username, email, emoji, password: passwordHash })

    return userDoc._id
  }
}

module.exports = { UsersPersistence, UsernameExistsError, EmailExistsError }
