const path = require('path')
const express = require('express')
const compression = require('compression')
const { Database } = require('./utils/db')
// const helmet = require('helmet')
// const https = require('./middleware/https')

// Init Express with Middleware
const app = express()
app.use(express.json())
app.use(compression())
// app.use(helmet())
// app.use(https)

// Init MongoDB
Database.connect()

// Define Routes
app.use('/api/users', require('./routes/api/users'))
app.use('/api/auth', require('./routes/api/auth'))
app.use('/api/challenges', require('./routes/api/challenges'))
app.use('/api/challengeoftheweek', require('./routes/api/challengeoftheweek'))

// Set static folder
app.use(express.static(path.join(__dirname, 'client-app')))

// Starting server
const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
