const jwt = require('jsonwebtoken')

class JwtMiddleware {
  constructor(secret) {
    this.secret = secret
  }

  validateJwt(req, res, next) {
    const token = req.header('x-auth-token')

    if (!token) {
      console.error(`Auth token missing for ${req.path}`)
      res.status(401).json({ msg: 'No token, authorization denied.' })
      return
    }

    try {
      const decodedToken = jwt.verify(token, this.secret)
      req.userId = decodedToken.userId
      next()
    } catch (err) {
      res.status(401).json({ msg: 'Token is not valid.' })
    }
  }
}

module.exports = {
  JwtMiddleware,
}
