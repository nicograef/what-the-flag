const { validationResult } = require('express-validator')

const { UsersPersistence, UsernameExistsError, EmailExistsError } = require('./users-persistence')

class UsersController {
  constructor() {
    this.persistence = new UsersPersistence()
  }

  async getAllUsers(_, res) {
    try {
      const users = await this.persistence.getAllUsersSortedByPoints()
      res.json(users)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }

  async createUser(req, res) {
    const validationErrors = validationResult(req)
    if (!validationErrors.isEmpty()) {
      const errors = validationErrors.array().map(({ param, msg }) => ({ param, msg }))
      res.status(400).json({ errors })
      return
    }

    try {
      const { username, email, password } = req.body
      const token = await this.persistence.createUser(username, email, password)

      res.status(201).json({ token })
    } catch (error) {
      console.error(error.message)

      if (error instanceof UsernameExistsError) {
        res.status(400).json({
          errors: [{ param: 'username', msg: 'This username already exists.' }],
        })
        return
      }

      if (error instanceof EmailExistsError) {
        res.status(400).json({
          errors: [{ param: 'email', msg: 'A user with this email already exists.' }],
        })
        return
      }

      res.status(500).send('Server Error')
    }
  }
}

module.exports = { UsersController }
