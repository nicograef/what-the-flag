const { UsernameExistsError, EmailExistsError } = require('./users-persistence')

class UsersController {
  constructor(service) {
    this.service = service
  }

  async getUsers(_, res) {
    try {
      const users = await this.service.getAllUsers()
      res.json(users)
    } catch (err) {
      console.error(err.message)
      res.status(500).send('Server Error')
    }
  }

  async postUser(req, res) {
    if (!req.body.username || req.body.username.length < 4) {
      res.status(400).json({ error: { param: 'username', msg: 'Please enter a username with 4 or more characters.' } })
      return
    }

    if (!req.body.password || req.body.password.length < 6) {
      res.status(400).json({ error: { param: 'password', msg: 'Please enter a password with 6 or more characters.' } })
      return
    }

    if (!req.body.email || this.isEmail(req.body.email) === false) {
      res.status(400).json({ error: { param: 'email', msg: 'Please enter a valid email.' } })
      return
    }

    try {
      const { username, email, password } = req.body
      const token = await this.service.createUser(username, email, password)

      res.status(201).json({ token })
    } catch (error) {
      console.error(error.message)

      if (error instanceof UsernameExistsError) {
        res.status(400).json({ error: { param: 'username', msg: 'This username already exists.' } })
        return
      }

      if (error instanceof EmailExistsError) {
        res.status(400).json({ error: { param: 'email', msg: 'A user with this email already exists.' } })
        return
      }

      res.status(500).send('Server Error')
    }
  }

  isEmail(email) {
    if (typeof email !== 'string') return false

    const emailRegEx = new RegExp(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    )

    return emailRegEx.test(email)
  }
}

module.exports = { UsersController }
