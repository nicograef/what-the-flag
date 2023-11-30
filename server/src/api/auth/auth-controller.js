const { UserNotFoundError, PasswordIncorrectError } = require('./auth-service')

class AuthController {
  constructor(service) {
    this.service = service
  }

  async getProfile(req, res) {
    try {
      const user = await this.service.getUserProfile(req.userId)
      res.json(user)
    } catch (error) {
      console.error(error.message)

      if (error instanceof UserNotFoundError) {
        res.status(404).send('User Not Found')
      } else {
        res.status(500).send('Server Error')
      }
    }
  }

  async postLogin(req, res) {
    if (!req.body.username || req.body.username.length < 4) {
      res.status(400).json({ error: { param: 'username', msg: 'Please enter a username with 4 or more characters.' } })
      return
    }

    if (!req.body.password || req.body.password.length < 6) {
      res.status(400).json({ error: { param: 'password', msg: 'Please enter a password with 6 or more characters.' } })
      return
    }

    try {
      const token = await this.service.loginUser(req.body.username, req.body.password)
      res.json({ token })
    } catch (error) {
      console.error(error.message)

      if (error instanceof UserNotFoundError || error instanceof PasswordIncorrectError) {
        res.status(400).json({
          error: { param: 'username', msg: 'Username or Password is not correct.' },
        })
      } else {
        res.status(500).send('Server Error')
      }
    }
  }
}

module.exports = { AuthController }
