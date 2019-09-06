const express = require('express')
const compression = require('compression')
const connectDB = require('./utils/db')
const path = require('path')

// Init Express with JSON Middleware
const app = express()
app.use(express.json())
app.use(compression())

// Init MongoDB
connectDB()

// Define Routes
app.use('/api/users', require('./routes/api/users'))
app.use('/api/auth', require('./routes/api/auth'))
app.use('/api/challenges', require('./routes/api/challenges'))
app.use('/api/challengeoftheweek', require('./routes/api/challengeoftheweek'))

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  // Set static folder
  app.use(express.static('client/build'))

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'))
  })
}

// Starting server
const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
