import express from "express"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User from "../models/user.js"

const router = express.Router()

// @route   POST api/auth/register
// @desc    Register user
// @access  Public
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body

  try {
    // Check if user exists
    let user = await User.findOne({ email })
    if (user) {
      return res.status(400).json({ msg: "User already exists" })
    }

    // Create new user instance
    user = new User({
      username,
      email,
      password,
    })

    // Hash password
    const salt = await bcrypt.genSalt(10)
    user.password = await bcrypt.hash(password, salt)

    // Save user to database
    await user.save()

    // Return JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username, // Include username in JWT payload
        email: user.email, // Include email in JWT payload
      },
    }

    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "1h" }, // Token expires in 1 hour
      (err, token) => {
        if (err) throw err
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } })
      },
    )
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post("/login", async (req, res) => {
  const { email, password } = req.body

  try {
    // Check if user exists
    const user = await User.findOne({ email })
    if (!user) {
      return res.status(400).json({ msg: "Invalid Credentials" })
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" })
    }

    // Return JWT
    const payload = {
      user: {
        id: user.id,
        username: user.username, // Include username in JWT payload
        email: user.email,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned,
      },
    }

    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "1h" }, (err, token) => {
      if (err) throw err
      // Get user data without password
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        isBanned: user.isBanned,
        banReason: user.banReason,
        joinDate: user.joinDate,
        totalPlayers: user.totalPlayers,
        avatar: user.avatar,
        bio: user.bio,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        profileVisibility: user.profileVisibility,
        showOnlineStatus: user.showOnlineStatus,
        allowInvites: user.allowInvites,
        preferredConsole: user.preferredConsole,
        timezone: user.timezone
      }
      res.json({ token, user: userData })
    })
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server error")
  }
})

export default router
