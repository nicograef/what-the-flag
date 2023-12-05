const { Database } = require('./database/database')
const { JwtService } = require('./services/jwt-service')
const { PasswordService } = require('./services/password-service')
const { Server } = require('./server')

const SERVER_PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET
const MONGODB_URI = process.env.MONGODB_URI

async function main() {
  const database = new Database(MONGODB_URI)
  await database.connect()

  const jwtMiddleware = new JwtService(JWT_SECRET)

  const server = new Server(jwtMiddleware, PasswordService)
  server.init()
  server.start(SERVER_PORT)
}

main()
