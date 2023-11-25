const mongoose = require('mongoose')

class Database {
  static async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI)
      console.log('MongoDB connected!')
    } catch (err) {
      console.error('MongoDB Error:', err.message)
      process.exit(1)
    }
  }
}

module.exports = { Database }
