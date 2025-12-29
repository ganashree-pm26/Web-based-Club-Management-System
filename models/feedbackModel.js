const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  feedbackKey: { type: String, required: true, unique: true },
  participantId: Number,
  eventId: Number,
  rating: Number,
  comment: String,
  suggestions: [String],
  submittedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model("Feedback", schema);
