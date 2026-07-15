const mongoose = require('mongoose');

const ChecklistItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, required: true },
  done: { type: Boolean, default: false }
}, { _id: false });

const NodeSchema = new mongoose.Schema({
  id: { type: String, required: true },
  parentId: { type: String, default: null },
  type: { type: String, enum: ['phase', 'milestone', 'file', 'task'], default: 'task' },
  label: { type: String, required: true },
  status: { type: String, enum: ['pending', 'progress', 'done'], default: 'pending' },
  checklist: { type: [ChecklistItemSchema], default: [] },
  notes: { type: String, default: '' },
  collapsed: { type: Boolean, default: false },
  assignedTo: { type: String, default: null },
  completedBy: { type: String, default: null }
}, { _id: false });

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, required: true },
  provider: { type: String, enum: ['gemini', 'groq'], default: 'gemini' },
  rawText: { type: String, default: '' },
  nodes: { type: [NodeSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Project', ProjectSchema);
