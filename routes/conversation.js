import express from "express"
import Conversation from "../models/conversation.js";
import {auth} from "../middleware/auth.js"

const router = express.Router()

// @route   POST api/conversations
// @desc    Create or get a conversation between two users
// @access  Private
router.post("/", auth, async (req, res) => {
  const { participantId } = req.body // The ID of the other user in the conversation

  try {
    // Check if a conversation already exists between these two users
    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, participantId] },
    })

    if (conversation) {
      return res.json(conversation) // Return existing conversation
    }

    // If not, create a new conversation
    conversation = new Conversation({
      participants: [req.user.id, participantId],
    })

    await conversation.save()
    res.status(201).json(conversation)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server Error")
  }
})

// @route   GET api/conversations
// @desc    Get all conversations for the authenticated user
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user.id })
      .populate("participants", "username isOnline lastSeen avatar") // Populate participant details
      .populate("lastMessage") // Populate last message details
      .sort({ updatedAt: -1 }) // Sort by most recent activity

    res.json(conversations)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server Error")
  }
})

// @route   GET api/conversations/:id
// @desc    Get a single conversation by ID
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.id).populate(
      "participants",
      "username isOnline lastSeen avatar",
    )

    if (!conversation) {
      return res.status(404).json({ msg: "Conversation not found" })
    }

    // Ensure the authenticated user is a participant
    if (!conversation.participants.some((p) => p._id.toString() === req.user.id)) {
      return res.status(401).json({ msg: "Not authorized to view this conversation" })
    }

    res.json(conversation)
  } catch (err) {
    console.error(err.message)
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Conversation not found" })
    }
    res.status(500).send("Server Error")
  }
})

export default router
