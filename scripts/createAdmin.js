import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import dotenv from "dotenv"
import User from "../models/user.js"

// Load env variables
dotenv.config()

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    const MONGO_URI = "mongodb+srv://i220821:P3dnajod2MYo4oJ0@testingdatabase.9qxvuhb.mongodb.net/"

    await mongoose.connect(MONGO_URI)
    console.log("MongoDB Connected...")

    // Admin user details
    const adminData = {
      username: "admin",
      email: "admin@gmail.com",
      password: "admin", // This will be hashed
      isAdmin: true
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      $or: [
        { email: adminData.email },
        { username: adminData.username }
      ]
    })

    if (existingAdmin) {
      console.log("Admin user already exists!")
      process.exit(0)
    }

    // Hash password
    const salt = await bcrypt.genSalt(10)
    adminData.password = await bcrypt.hash(adminData.password, salt)

    // Create admin user
    const admin = new User(adminData)
    await admin.save()

    console.log("Admin user created successfully!")
    console.log("Email:", adminData.email)
    console.log("Password:", adminData.password)  // Show the unhashed password
    process.exit(0)
  } catch (err) {
    console.error("Error:", err.message)
    process.exit(1)
  }
}

createAdmin()
