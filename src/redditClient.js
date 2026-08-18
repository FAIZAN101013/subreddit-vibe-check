// All Reddit traffic goes through our own /api/reddit endpoint.
//
// Fetching reddit.com straight from the browser doesn't work: the public .json
// endpoints send no Access-Control-Allow-Origin, so the browser rejects the
// response, and a cross-origin request can't carry the Reddit session cookies
// that make those endpoints answer. The server side picks the best available
// source — see api/_reddit.js.

export class VibeCheckError extends Error {
  constructor(message, hint) {
    super(message);
    this.hint = hint;
  }
}

// Reddit's feed applies its rate limit per source IP. Every call to our
// endpoint can be served by a different serverless instance, so a repeat
// request is not the same request again — it is a fresh roll of the dice on an
// instance that may not be limited. That makes retrying genuinely effective
// here rather than just polite waiting.
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestOnce(subreddit) {
  let response;

  try {
    response = await fetch(
      `/api/reddit?subreddit=${encodeURIComponent(subreddit)}`
    );
  } catch {
    throw new VibeCheckError(
      "Couldn't reach the API.",
      "Check your connection, or start the local server with: cd server && npm start"
    );
  }

  const data = await response.json().catch(() => ({}));

  if (response.ok) {
    return {
      posts: data.posts || [],
      source: data.mode,
      degraded: data.degraded || null,
    };
  }

  throw Object.assign(
    new VibeCheckError(
      data.error || "Unable to fetch subreddit data.",
      data.setupRequired
        ? "Add Reddit API credentials to server/.env, then restart the server."
        : null
    ),
    { retryable: Boolean(data.retryable) }
  );
}

/**
 * Fetch and normalize hot posts.
 *
 * @param {string} rawName        subreddit, with or without a leading r/
 * @param {(attempt: number, of: number) => void} [onRetry]
 *        called before each retry so the UI can show progress
 */
export async function fetchHotPosts(rawName, onRetry) {
  const subreddit = rawName.trim().replace(/^\/?r\//i, "");

  if (!subreddit) {
    throw new VibeCheckError("Please enter a subreddit.");
  }

  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) {
    throw new VibeCheckError("That doesn't look like a valid subreddit name.");
  }

  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await requestOnce(subreddit);
      return { subreddit, ...result };
    } catch (error) {
      lastError = error;

      const worthRetrying = error.retryable && attempt < MAX_ATTEMPTS;

      if (!worthRetrying) break;

      onRetry?.(attempt + 1, MAX_ATTEMPTS);
      await sleep(RETRY_DELAY_MS);
    }
  }

  if (lastError.retryable) {
    throw new VibeCheckError(
      "Reddit is rate limiting requests right now.",
      "It let us through on some subreddits — try another, or give it a minute."
    );
  }

  throw lastError;
}
