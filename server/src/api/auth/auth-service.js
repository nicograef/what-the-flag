class UserNotFoundError extends Error {}
class PasswordIncorrectError extends Error {}

class AuthService {
  constructor(persistence, jwtService, passwordService) {
    this.persistence = persistence
    this.jwtService = jwtService
    this.passwordService = passwordService
  }

  async getUserProfile(userId) {
    const user = this.persistence.getUserWithoutPassword(userId)
    if (user === null) throw new UserNotFoundError()
    return user
  }

  async loginUser(username, password) {
    const user = await this.persistence.getUserByUsername(username)
    if (user === null) throw new UserNotFoundError()

    const isCorrect = await this.passwordService.verifyPassword(password, user.password)
    if (isCorrect !== true) throw new PasswordIncorrectError()

    const token = this.jwtService.createNewToken({ userId: user.id })

    return token
  }
}

module.exports = { AuthService, UserNotFoundError, PasswordIncorrectError }
