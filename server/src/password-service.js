const bcrypt = require('bcrypt')

class PasswordService {
  static async hashPassword(password) {
    const salt = await bcrypt.genSalt(10)
    const passwordHash = await bcrypt.hash(password, salt)
    return passwordHash
  }

  static async verifyPassword(password, hash) {
    const isCorrect = await bcrypt.compare(password, hash)
    return isCorrect
  }
}

module.exports = {
  PasswordService,
}
