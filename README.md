# Waypoint

Paste an AI-generated implementation plan → get a trackable mind map, with the small
quality-gate steps (lint, tests, review, merge, edge cases) kept as a checklist so
they don't get forgotten milestone to milestone. Backed by MongoDB Atlas, so your
plans persist and sync across any browser/device you open this on.

## Setup (one time)

1. Install dependencies:
   ```
   npm install
   ```
2. Copy the env template and fill in your Atlas connection string:
   ```
   cp .env.example .env
   ```
   Open `.env` and paste your real `mongodb+srv://...` URI from
   Atlas → Database → Connect → Drivers (replace `<password>` with your DB user's password).

## Run it

```
npm start
```

Then open **http://localhost:5000** in your browser. That's it — the same server
serves both the app and the API, so there's no CORS setup needed.

## Using it

1. **+ New plan** → paste the raw AI-generated plan text, pick Gemini or Groq, paste that provider's API key.
2. It gets structured into Phase → Milestone → File/Task nodes, each with an auto-generated
   checklist of small steps that are easy to skip when moving fast.
3. Click any node to mark it Pending / In Progress / Done, check off steps, add notes,
   or add your own child node if the AI missed something.
4. Everything autosaves to MongoDB ~500ms after each edit (see the "Saving…" / "Saved to Atlas"
   indicator in the top bar).

## Notes

- Gemini/Groq API keys are kept in your browser's localStorage only (never sent to your
  own server) — they go straight from your browser to Google/Groq.
- Plan and node data lives in MongoDB Atlas via this app's own `/api/projects` routes.
- To deploy this somewhere (Render, Railway, a VPS) instead of running locally, just set
  the `MONGODB_URI` and `PORT` environment variables there and run `npm start`.

## MCP (Model Context Protocol) Server

Waypoint includes a built-in MCP server supporting both **STDIO** (for local clients like Claude/ChatGPT Desktop or Cursor) and **SSE** (for remote clients or custom LLMs).

This allows you to connect an LLM directly to your Waypoint database so that the AI can list, read, update, or create your implementation plans dynamically during chat!

### Available Tools
- `list_projects`: Lists all projects (IDs, slugs, titles, and nodes count).
- `get_project`: Gets the full mind-map tree of nodes, status, and checklist items.
- `create_project`: Creates a new plan with a name and title.
- `add_node`: Appends a node (phase, milestone, file, or task) to an existing plan.
- `update_node_status`: Sets node status to `pending`, `progress`, or `done`.
- `add_checklist_item`: Adds a task to a node's checklist.
- `update_checklist_item`: Toggles checklist item completion.
- `update_node_notes`: Updates node text notes.

---

### Connecting to ChatGPT & Desktop LLMs

#### 1. Via ChatGPT Desktop App / Claude Desktop (STDIO)
To use Waypoint tools locally:
1. Open your LLM's desktop app settings (e.g. ChatGPT Desktop -> Settings -> MCP Servers).
2. Click **Add Server** and configure:
   - **Type**: `STDIO`
   - **Command**: `node`
   - **Arguments**: `d:/planner/mcp-stdio.js` (Use absolute path to `mcp-stdio.js` in your workspace).
   - **Environment Variables**: Set `MONGODB_URI` to your Atlas connection string (or it will load from the local `.env`).

*Alternatively, run `npm run mcp` to start the stdio server standalone.*

#### 2. Via Custom GPT Actions (SSE)
You can connect ChatGPT Actions or remote tools to the SSE server:
1. Start the server: `npm start` (or deploy to Vercel/Render).
2. Expose the server to the internet using a tunnel (e.g., `ngrok http 5000`) if running locally.
3. Configure the custom GPT Action using the following endpoints:
   - **SSE Endpoint (GET)**: `https://<your-domain>/mcp/sse?token=<jwt-token>`
   - **Messages Endpoint (POST)**: `https://<your-domain>/mcp/messages?token=<jwt-token>`
4. **Security & Permissions**:
   - Every request to the SSE endpoints must carry a valid Waypoint JWT token (passed as the `token` query parameter or in the `Authorization: Bearer <token>` header).
   - Any user logged in with a valid token can view projects (`list_projects`, `get_project`).
   - Modifying actions (creating projects, adding nodes, updating checklists, editing notes) are strictly restricted and require the user to have the `admin` role in Waypoint. Non-admin users attempting these operations will receive a `403 Forbidden` error.

