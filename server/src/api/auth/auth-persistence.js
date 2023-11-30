const User = require('../../database/models/User')

class AuthPersistence {
  async getUserWithoutPassword(userId) {
    return User.findById(userId).select('-password')
  }

  async getUserByUsername(username) {
    return User.findOne({ username })
  }
}

module.exports = { AuthPersistence }
