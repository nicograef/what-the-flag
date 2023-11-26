const mongoose = require('mongoose')

class Database {
  constructor(mongoDbUri) {
    this.mongoDbUri = mongoDbUri
  }

  async connect() {
    try {
      await mongoose.connect(this.mongoDbUri)
      console.log('MongoDB connected!')
    } catch (err) {
      console.error('MongoDB Error:', err.message)
      process.exit(1)
    }
  }
}

module.exports = { Database }
