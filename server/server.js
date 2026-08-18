// Local development API server. In production the same logic runs as a
// Vercel serverless function (api/reddit.js) — both share api/_reddit.js.
import "dotenv/config";

import express from "express";
import cors from "cors";

import {
  fetchHotPosts,
  RedditError,
  credentialsReady,
} from "../api/_reddit.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    credentialsReady,
    mode: credentialsReady ? "oauth" : "anonymous",
    message: credentialsReady
      ? "Reddit credentials loaded — using OAuth."
      : "No credentials set — falling back to the public .json endpoint, " +
        "which Reddit blocks from datacenter IPs.",
  });
});

app.get("/api/reddit", async (req, res) => {
  try {
    const result = await fetchHotPosts(req.query.subreddit);
    res.json(result);
  } catch (error) {
    if (error instanceof RedditError) {
      return res.status(error.status).json({
        error: error.message,
        setupRequired: error.status === 403 && !credentialsReady,
      });
    }

    console.error("Unexpected error:", error);
    res.status(500).json({ error: "Something went wrong talking to Reddit." });
  }
});

app.listen(PORT, () => {
  console.log(`Reddit API server running on http://localhost:${PORT}`);
  console.log(
    credentialsReady
      ? "Using OAuth credentials from server/.env"
      : "No credentials in server/.env — trying the public .json endpoint."
  );
});
