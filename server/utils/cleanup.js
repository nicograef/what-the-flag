const connectDB = require("./db");

const Challenge = require("../models/Challenge");
const User = require("../models/User");

async function cleanup() {
  await connectDB();
  const [johnDoe] = await User.find({ username: "johndoe" });
  const res = await Challenge.deleteMany({
    $or: [{ from: johnDoe.id }, { to: johnDoe.id }],
  });
  console.log(res.deletedCount);
}

cleanup();
