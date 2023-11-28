const bcrypt = require('bcrypt')

const { getRandomEmoji } = require('./get-random-emoji')

class UsersService {
  constructor(persistence, jwtService) {
    this.persistence = persistence
    this.jwtService = jwtService
  }

  async getAllUsers() {
    const users = await this.persistence.getAllUsersSortedByPoints()

    return users
  }

  async createUser(username, email, password) {
    const emoji = getRandomEmoji()
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)

    const userId = await this.persistence.createUser(username, email, passwordHash, emoji)

    const token = this.jwtService.createNewToken({ userId })

    return token
  }
}

module.exports = { UsersService }
