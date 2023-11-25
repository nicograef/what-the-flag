const mongoose = require('mongoose')

export class Database {
  async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI)
      console.log('MongoDB connected!')
    } catch (err) {
      console.error('MongoDB Error:', err.message)
      process.exit(1)
    }
  }
}
