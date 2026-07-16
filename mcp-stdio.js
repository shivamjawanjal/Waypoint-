#!/usr/bin/env node
require("dotenv").config();
const mongoose = require("mongoose");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const server = require("./mcpServer");

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Error: MONGODB_URI is not defined in the environment or .env file.");
  process.exit(1);
}

// Quietly connect to MongoDB Atlas
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.error("Connected to MongoDB Atlas for MCP STDIO Transport");
    
    // Create the Stdio transport
    const transport = new StdioServerTransport();
    
    // Connect the server to the transport
    await server.connect(transport);
    console.error("Waypoint MCP Server running via STDIO transport");
  })
  .catch(err => {
    console.error("MongoDB connection failed for MCP:", err.message);
    process.exit(1);
  });
