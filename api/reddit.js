// Vercel serverless function: GET /api/reddit?subreddit=technology
import { fetchHotPosts, RedditError, credentialsReady } from "./_reddit.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const { subreddit } = req.query;

  try {
    const result = await fetchHotPosts(subreddit);

    // Hot posts move slowly; a short edge cache keeps us under Reddit's limits.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600"
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof RedditError) {
      return res.status(error.status).json({
        error: error.message,
        setupRequired: error.status === 403 && !credentialsReady,
      });
    }

    console.error("Unexpected error:", error);

    return res
      .status(500)
      .json({ error: "Something went wrong talking to Reddit." });
  }
}
