import express from "express"
import Message from "../models/message.js"
import Conversation from "../models/conversation.js";
import {auth} from "../middleware/auth.js";

const router = express.Router()

// @route   POST api/messages
// @desc    Send a new message
// @access  Private
router.post("/", auth, async (req, res) => {
  const { conversationId, content } = req.body

  try {
    const conversation = await Conversation.findById(conversationId)

    if (!conversation) {
      return res.status(404).json({ msg: "Conversation not found" })
    }

    // Ensure the authenticated user is a participant
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({ msg: "Not authorized to send messages in this conversation" })
    }

    const newMessage = new Message({
      conversation: conversationId,
      sender: req.user.id,
      content,
    })

    const message = await newMessage.save()

    // Update lastMessage in conversation
    conversation.lastMessage = message._id
    conversation.updatedAt = Date.now()
    await conversation.save()

    res.status(201).json(message)
  } catch (err) {
    console.error(err.message)
    res.status(500).send("Server Error")
  }
})

// @route   GET api/messages/:conversationId
// @desc    Get all messages for a specific conversation
// @access  Private
router.get("/:conversationId", auth, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)

    if (!conversation) {
      return res.status(404).json({ msg: "Conversation not found" })
    }

    // Ensure the authenticated user is a participant
    if (!conversation.participants.includes(req.user.id)) {
      return res.status(401).json({ msg: "Not authorized to view this conversation" })
    }

    const messages = await Message.find({ conversation: req.params.conversationId })
      .populate("sender", "username avatar")
      .sort({ timestamp: 1 })

    res.json(messages)
  } catch (err) {
    console.error(err.message)
    if (err.kind === "ObjectId") {
      return res.status(404).json({ msg: "Conversation not found" })
    }
    res.status(500).send("Server Error")
  }
})

export default router
