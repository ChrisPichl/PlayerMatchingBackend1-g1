import mongoose from "mongoose"

const ConversationSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    auto: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  ],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Update `updatedAt` on save
ConversationSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Conversation = mongoose.model("Conversation", ConversationSchema)
export default Conversation
