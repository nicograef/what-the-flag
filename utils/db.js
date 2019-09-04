const mongoose = require('mongoose')

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useCreateIndex: true,
      useFindAndModify: false
    })
    console.log('MongoDB connected!')
  } catch (err) {
    console.error('MongoDB Error:', err.message)
    process.exit(1)
  }
}

module.exports = connectDB
