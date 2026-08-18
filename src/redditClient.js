// All Reddit traffic goes through our own /api/reddit endpoint.
//
// Fetching reddit.com straight from the browser doesn't work: the public .json
// endpoints send no Access-Control-Allow-Origin, so the browser rejects the
// response, and a cross-origin request can't carry the Reddit session cookies
// that make those endpoints answer in the first place. The server side picks
// the best available source — see api/_reddit.js.

export class VibeCheckError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

export async function fetchHotPosts(rawName) {
  const subreddit = rawName.trim().replace(/^\/?r\//i, "");

  if (!subreddit) {
    throw new VibeCheckError("Please enter a subreddit.");
  }

  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) {
    throw new VibeCheckError("That doesn't look like a valid subreddit name.");
  }

  let response;

  try {
    response = await fetch(
      `/api/reddit?subreddit=${encodeURIComponent(subreddit)}`
    );
  } catch {
    throw new VibeCheckError(
      "Couldn't reach the API.",
      "Start it with: cd server && npm start"
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new VibeCheckError(
      data.error || "Unable to fetch subreddit data.",
      data.setupRequired
        ? "Add Reddit API credentials to server/.env, then restart the server."
        : null
    );
  }

  return {
    subreddit,
    posts: data.posts || [],
    source: data.mode,
    degraded: data.degraded || null,
  };
}
