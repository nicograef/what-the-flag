import express from 'express'
// import helmet from 'helmet'
import compression from 'compression'
import database from './utils/db'
import path from 'path'
// import https from './middleware/https'

// Init Express with Middleware
const app = express()
app.use(express.json())
app.use(compression())
// app.use(helmet())
// app.use(https)

// Init MongoDB
database.connect()

// Define Routes
app.use('/api/users', require('./routes/api/users'))
app.use('/api/auth', require('./routes/api/auth'))
app.use('/api/challenges', require('./routes/api/challenges'))
app.use('/api/challengeoftheweek', require('./routes/api/challengeoftheweek'))

// Set static folder
app.use(express.static('client/build'))

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
})

// Starting server
const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
