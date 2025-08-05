import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import cors from "cors"
import { createServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import Message from "./models/message.js"
import Conversation from "./models/conversation.js"
import User from "./models/user.js"

// Load env variables
dotenv.config()
if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is not defined in .env file")
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
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  process.env.FRONTEND_URL,
  process.env.RENDER_EXTERNAL_URL,
].filter(Boolean)

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
      // Allow requests with no origin (mobile apps, etc.)
      if (!origin) return callback(null, true)

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error("Not allowed by CORS"))
      }
    },
    credentials: true,
  }),
)
app.use(express.json())

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log("MongoDB Connected...")
  } catch (err) {
    console.error("MongoDB connection error:", err.message)
    process.exit(1)
  }
}
connectDB()

// Add better error handling and logging
process.on("unhandledRejection", (err) => {
  console.log("Unhandled Rejection:", err.message)
  process.exit(1)
})

process.on("uncaughtException", (err) => {
  console.log("Uncaught Exception:", err.message)
  process.exit(1)
})

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id)

  // Join a conversation room
  socket.on("joinRoom", (conversationId) => {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      console.error(`Invalid conversationId: ${conversationId}`)
      return
    }
    socket.join(conversationId)
    console.log(`User ${socket.id} joined room ${conversationId}`)
  })

  // Handle new messages
  socket.on("sendMessage", async ({ conversationId, senderId, content }) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(conversationId) || !mongoose.Types.ObjectId.isValid(senderId)) {
        console.error(`Invalid conversationId or senderId: ${conversationId}, ${senderId}`)
        return
      }

      const conversation = await Conversation.findById(conversationId)
      if (!conversation) {
        console.error(`Conversation not found: ${conversationId}`)
        return
      }

      if (!conversation.participants.includes(senderId)) {
        console.error(`User ${senderId} not authorized for conversation ${conversationId}`)
        return
      }

      const newMessage = new Message({
        conversation: conversationId,
        sender: senderId,
        content,
      })

      const savedMessage = await newMessage.save()

      // Update conversation's lastMessage and updatedAt
      conversation.lastMessage = savedMessage._id
      conversation.updatedAt = new Date()
      await conversation.save()

      // Populate sender details for emission
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

      console.log(`Message in room ${conversationId} from ${senderId}: ${content}`)
    } catch (err) {
      console.error("Error saving message:", err.message)
    }
  })

  // Handle user online status
  socket.on("goOnline", async (userId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error(`Invalid userId: ${userId}`)
        return
      }
      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: null })
      console.log(`User ${userId} is online`)
      io.emit("userStatusUpdate", { userId, isOnline: true })
    } catch (err) {
      console.error("Error updating online status:", err.message)
    }
  })

  // Handle user offline status
  socket.on("goOffline", async (userId) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.error(`Invalid userId: ${userId}`)
        return
      }
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
      console.log(`User ${userId} is offline`)
      io.emit("userStatusUpdate", { userId, isOnline: false })
    } catch (err) {
      console.error("Error updating offline status:", err.message)
    }
  })

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
  })
})

// Define API routes
app.use("/api/auth", authRoutes)
app.use("/api/players", playerRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/conversations", conversationRoutes)
app.use("/api/users", userRoutes)
app.use("/api/admin", adminRoutes)

// Serve uploaded files (for player photos/screenshots)
app.use("/uploads", express.static("Uploads"))

// Basic route for testing
app.get("/", (req, res) => {
  res.send("2K Lobby Backend API is running!")
})

const PORT = process.env.PORT || 10000

httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
