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
