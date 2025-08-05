import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import cors from "cors"
import { createServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import Message from "./models/message.js"
import Conversation from "./models/conversation.js"
import User from "./models/user.js"

// Load env variables first
dotenv.config()

// Validate required environment variables
const requiredEnvVars = ["MONGO_URI", "JWT_SECRET"]
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar])

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(", ")}`)
  console.error("Please set these variables in your Render dashboard")
  process.exit(1)
}

// Import routes
import authRoutes from "./routes/auth.js"
import playerRoutes from "./routes/player.js"
import messageRoutes from "./routes/message.js"
import conversationRoutes from "./routes/conversation.js"
import userRoutes from "./routes/user.js"
import adminRoutes from "./routes/admin.js"

const app = express()
const httpServer = createServer(app)

// CORS configuration - automatically handles localhost and deployed URLs
const getAllowedOrigins = () => {
  const origins = ["http://localhost:3000", "http://localhost:5000", "http://localhost:5173", "https://localhost:5000"]

  // Add environment-specific origins
  if (process.env.FRONTEND_URL) origins.push(process.env.FRONTEND_URL)
  if (process.env.RENDER_EXTERNAL_URL) origins.push(process.env.RENDER_EXTERNAL_URL)
  if (process.env.NETLIFY_URL) origins.push(process.env.NETLIFY_URL)
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`)

  return origins.filter(Boolean)
}

const allowedOrigins = getAllowedOrigins()

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
})

// Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true)

      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        console.log(`🚫 CORS blocked origin: ${origin}`)
        callback(new Error("Not allowed by CORS"))
      }
    },
    credentials: true,
  }),
)

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`)
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message)
    process.exit(1)
  }
}

// Initialize database connection
connectDB()

// Graceful error handling
process.on("unhandledRejection", (err) => {
  console.log("❌ Unhandled Rejection:", err.message)
  httpServer.close(() => {
    process.exit(1)
  })
})

process.on("uncaughtException", (err) => {
  console.log("❌ Uncaught Exception:", err.message)
  process.exit(1)
})

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id)

  socket.on("joinRoom", (conversationId) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      console.error(`❌ Invalid conversationId: ${conversationId}`)
      return
    }
    socket.join(conversationId)
    console.log(`🏠 User ${socket.id} joined room ${conversationId}`)
  })

  socket.on("sendMessage", async ({ conversationId, senderId, content }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(senderId)) {
        console.error(`❌ Invalid IDs: ${conversationId}, ${senderId}`)
        return
      }

      const conversation = await Conversation.findById(conversationId)
      if (!conversation) {
        console.error(`❌ Conversation not found: ${conversationId}`)
        return
      }

      if (!conversation.participants.includes(senderId)) {
        console.error(`❌ User ${senderId} not authorized for conversation ${conversationId}`)
        return
      }

      const newMessage = new Message({
        conversation: conversationId,
        sender: senderId,
        content,
      })

      const savedMessage = await newMessage.save()
      conversation.lastMessage = savedMessage._id
      conversation.updatedAt = new Date()
      await conversation.save()

      const populatedMessage = await Message.findById(savedMessage._id).populate("sender", "username avatar")

      io.to(conversationId).emit("receiveMessage", {
        _id: populatedMessage._id,
        conversation: populatedMessage.conversation,
        sender: {
          _id: populatedMessage.sender._id,
          username: populatedMessage.sender.username,
          avatar: populatedMessage.sender.avatar,
        },
        content: populatedMessage.content,
        timestamp: populatedMessage.timestamp,
      })

      console.log(`💬 Message sent in room ${conversationId}`)
    } catch (err) {
      console.error("❌ Error saving message:", err.message)
    }
  })

  socket.on("goOnline", async (userId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error(`❌ Invalid userId: ${userId}`)
        return
      }
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: null })
      console.log(`🟢 User ${userId} is online`)
      io.emit("userStatusUpdate", { userId, isOnline: true })
    } catch (err) {
      console.error("❌ Error updating online status:", err.message)
    }
  })

  socket.on("goOffline", async (userId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error(`❌ Invalid userId: ${userId}`)
        return
      }
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
      console.log(`🔴 User ${userId} is offline`)
      io.emit("userStatusUpdate", { userId, isOnline: false })
    } catch (err) {
      console.error("❌ Error updating offline status:", err.message)
    }
  })

  socket.on("disconnect", () => {
    console.log("👋 User disconnected:", socket.id)
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  })
})

// API routes
app.use("/api/auth", authRoutes)
app.use("/api/players", playerRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/conversations", conversationRoutes)
app.use("/api/users", userRoutes)
app.use("/api/admin", adminRoutes)

// Serve uploaded files
app.use("/uploads", express.static("uploads"))

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "🏀 2K Lobby Backend API is running!",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/auth",
      players: "/api/players",
      users: "/api/users",
      messages: "/api/messages",
      conversations: "/api/conversations",
      admin: "/api/admin",
    },
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ message: "Route not found" })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack)
  res.status(500).json({ message: "Something went wrong!" })
})

const PORT = process.env.PORT || 10000

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`🔗 Allowed origins: ${allowedOrigins.join(", ")}`)
})
