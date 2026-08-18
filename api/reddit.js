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

    // The edge cache does the heavy lifting: a serverless instance is recycled
    // between requests, so its in-process cache often starts empty, while this
    // is shared by every visitor. Once a subreddit has been fetched
    // successfully, stale-while-revalidate keeps serving it instantly for a
    // day rather than letting Reddit's feed rate limit produce an error page.
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=900, stale-while-revalidate=86400"
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
