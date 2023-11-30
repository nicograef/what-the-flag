const { getRandomEmoji } = require('./get-random-emoji')

class UsersService {
  constructor(persistence, jwtService, passwordService) {
    this.persistence = persistence
    this.jwtService = jwtService
    this.passwordService = passwordService
  }

  async getAllUsers() {
    const users = await this.persistence.getAllUsersSortedByPoints()

    return users
  }

  async createUser(username, email, password) {
    const emoji = getRandomEmoji()

    const passwordHash = await this.passwordService.hashPassword(password)

    const userId = await this.persistence.createUser(username, email, passwordHash, emoji)

    const token = this.jwtService.createNewToken({ userId })

    return token
  }
}

module.exports = { UsersService }
