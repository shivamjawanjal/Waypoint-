require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Project = require('./models/Project');
const User = require('./models/User');
const { authenticate, requireRole, JWT_SECRET } = require('./middleware/auth');
const mcpServer = require('./mcpServer');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI. Copy .env.example to .env and fill in your Atlas connection string.');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- Auth routes ----

// Check if first-run setup is needed or signup is enabled
app.get('/api/auth/status', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({
      needsSetup: count === 0,
      inviteCodeEnabled: !!process.env.INVITE_CODE
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// First-run admin creation
app.post('/api/auth/setup', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(400).json({ error: 'Admin already exists' });

    const { userId, name, password } = req.body;
    if (!userId || !name || !password) return res.status(400).json({ error: 'userId, name, and password are required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const user = await User.create({ userId: userId.trim(), name: name.trim(), role: 'admin', password });
    const token = jwt.sign({ userId: user.userId, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { userId: user.userId, name: user.name, role: user.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'User ID already taken' });
    res.status(400).json({ error: err.message });
  }
});

// Self-signup with invite code
app.post('/api/auth/signup', async (req, res) => {
  try {
    const inviteCodeConfig = process.env.INVITE_CODE;
    if (!inviteCodeConfig) {
      return res.status(403).json({ error: 'Self-registration is disabled (no invite code configured).' });
    }

    const { userId, name, password, inviteCode } = req.body;
    if (!userId || !name || !password || !inviteCode) {
      return res.status(400).json({ error: 'All fields (userId, name, password, and inviteCode) are required' });
    }

    if (inviteCode.trim() !== inviteCodeConfig.trim()) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const user = await User.create({ userId: userId.trim(), name: name.trim(), role: 'user', password });
    const token = jwt.sign({ userId: user.userId, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { userId: user.userId, name: user.name, role: user.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'User ID already taken' });
    res.status(400).json({ error: err.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, password } = req.body;
    if (!userId || !password) return res.status(400).json({ error: 'userId and password are required' });

    const user = await User.findOne({ userId: userId.trim() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const match = await user.comparePassword(password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: user.userId, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { userId: user.userId, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ---- User management (admin only) ----

app.get('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { userId, name, role, password } = req.body;
    if (!userId || !name || !password) return res.status(400).json({ error: 'userId, name, and password are required' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const user = await User.create({
      userId: userId.trim(),
      name: name.trim(),
      role: role === 'admin' ? 'admin' : 'user',
      password
    });
    res.status(201).json({ userId: user.userId, name: user.name, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ error: 'User ID already taken' });
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const target = await User.findOne({ userId: req.params.userId });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });
    }
    await User.deleteOne({ userId: req.params.userId });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Project routes (auth-protected) ----

app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/projects/:id', authenticate, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/projects', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const project = await Project.create(req.body);
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/projects/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const updated = await Project.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/projects/:id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- MCP SSE Routes ----
const mcpTransports = new Map();

// JWT Authentication middleware for MCP endpoints (GET sse and POST messages)
const authenticateMcp = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;
  
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (queryToken) {
    token = queryToken.trim();
  }
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required: JWT token must be provided via Authorization header or ?token query parameter.' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.auth = decoded; // Propagates as authInfo in the MCP transport
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired JWT token' });
  }
};

app.get('/mcp/sse', authenticateMcp, async (req, res) => {
  const transport = new SSEServerTransport('/mcp/messages', res);
  mcpTransports.set(transport.sessionId, transport);
  
  res.on('close', () => {
    mcpTransports.delete(transport.sessionId);
  });
  
  await mcpServer.connect(transport);
});

app.post('/mcp/messages', authenticateMcp, async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = mcpTransports.get(sessionId);
  
  if (transport) {
    await transport.handlePostMessage(req, res, req.body);
  } else {
    res.status(400).send('Session not found');
  }
});

// Fallback: serve the app for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB Atlas');
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      app.listen(PORT, () => console.log(`Waypoint running at http://localhost:${PORT}`));
    }
  })
  .catch(err => {
    console.error('MongoDB connection failed:', err.message);
    if (!process.env.VERCEL) {
      process.exit(1);
    }
  });

module.exports = app;
