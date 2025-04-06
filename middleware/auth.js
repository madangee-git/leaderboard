const fs = require("fs");
const jwt = require("jsonwebtoken");
const jwtSecret = fs.readFileSync("/run/secrets/jwt_secret", "utf8").trim();

function authenticate(req, res, next) {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "Access denied. No token provided." });

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token." });
  }
}

module.exports = authenticate;
