const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  // Get token from header
  const token = req.header("x-auth-token");

  // Check if there is a token
  if (!token)
    return res.status(401).json({ msg: "No token, authorization denied." });

  try {
    // Verify token
    const secret = process.env.JWT_SECRET;
    const decodedToken = jwt.verify(token, secret);

    // Set User ID in request object
    req.userId = decodedToken.userId;

    next();
  } catch (err) {
    res.status(401).json({ msg: "Token is not valid." });
  }
};
