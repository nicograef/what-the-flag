const { Database } = require('./database/database')
const { JwtMiddleware } = require('./middleware/jwt-middleware')
const { Server } = require('./server')

const SERVER_PORT = process.env.PORT || 5000
const JWT_SECRET = process.env.JWT_SECRET
const MONGODB_URI = process.env.MONGODB_URI
const ENVIRONMENT = process.env.NODE_ENV === 'production' ? 'production' : 'development'

async function main() {
  const database = new Database(MONGODB_URI)
  await database.connect()

  const jwtMiddleware = new JwtMiddleware(JWT_SECRET)

  const server = new Server(ENVIRONMENT, jwtMiddleware)
  server.init()
  server.start(SERVER_PORT)
}

main()
