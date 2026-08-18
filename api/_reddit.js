// Shared Reddit fetching logic, used by both the Vercel serverless function
// (api/reddit.js) and the local Express dev server (server/server.js).

const {
  REDDIT_CLIENT_ID,
  REDDIT_CLIENT_SECRET,
  REDDIT_USERNAME,
  REDDIT_PASSWORD,
} = process.env;

// Reddit wants a descriptive, unique User-Agent or it answers 429/403.
const USER_AGENT = `web:subreddit-vibe-check:v1.0 (by /u/${
  REDDIT_USERNAME || "anonymous"
})`;

// Values copied from .env.example that mean "not filled in yet".
const isPlaceholder = (value) =>
  !value || /^your[_-]/i.test(value) || value.includes("<");

export const credentialsReady =
  !isPlaceholder(REDDIT_CLIENT_ID) &&
  !isPlaceholder(REDDIT_CLIENT_SECRET) &&
  !isPlaceholder(REDDIT_USERNAME) &&
  !isPlaceholder(REDDIT_PASSWORD);

export class RedditError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function cleanSubredditName(raw) {
  return String(raw || "")
    .trim()
    .replace(/^\/?r\//i, "")
    .replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// OAuth token, cached in module scope until just before it expires
// ---------------------------------------------------------------------------

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const basicAuth = Buffer.from(
    `${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`
  ).toString("base64");

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: new URLSearchParams({
      grant_type: "password",
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new RedditError(
      502,
      "Reddit rejected the app credentials. Check that the app is a 'script' " +
        "app, that the account has no 2FA, and that the id/secret are correct."
    );
  }

  const data = await response.json();

  cachedToken = data.access_token;
  // Tokens last ~24h; refresh a minute early.
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

  return cachedToken;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function fetchAuthenticated(subreddit, limit) {
  const token = await getAccessToken();

  const response = await fetch(
    `https://oauth.reddit.com/r/${encodeURIComponent(
      subreddit
    )}/hot?limit=${limit}&raw_json=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
      },
    }
  );

  if (response.status === 401) {
    // Token went stale mid-flight; drop it so the next call re-authenticates.
    cachedToken = null;
  }

  return response;
}

async function fetchAnonymous(subreddit, limit) {
  return fetch(
    `https://www.reddit.com/r/${encodeURIComponent(
      subreddit
    )}/hot.json?limit=${limit}&raw_json=1`,
    {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    }
  );
}

function normalize(children) {
  return children
    .filter((child) => child.kind === "t3")
    .map(({ data: post }) => ({
      id: post.id,
      title: post.title,
      author: post.author,
      subreddit: post.subreddit,
      score: post.score,
      numComments: post.num_comments,
      permalink: `https://www.reddit.com${post.permalink}`,
      createdUtc: post.created_utc,
      flair: post.link_flair_text || null,
      stickied: post.stickied,
      nsfw: post.over_18,
    }));
}


// ---------------------------------------------------------------------------
// RSS fallback
//
// Reddit fingerprints non-browser HTTP clients and 403s the public .json
// endpoints for them regardless of IP, but the Atom feeds still answer. They
// carry titles, authors and links — enough for sentiment — but no score or
// comment count, and they rate limit aggressively, hence the cache.
// ---------------------------------------------------------------------------

const decodeEntities = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const tagValue = (entry, tag) => {
  const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return match ? decodeEntities(match[1].trim()) : null;
};

function parseAtom(xml, subreddit) {
  const entries = xml.split("<entry>").slice(1);

  return entries
    .map((entry) => {
      const id = (tagValue(entry, "id") || "").replace(/^t3_/, "");
      const title = tagValue(entry, "title");
      const href = (entry.match(/<link[^>]*href="([^"]+)"/) || [])[1];
      const author = (tagValue(entry, "name") || "").replace(/^\/u\//, "");
      const published = tagValue(entry, "published");

      if (!id || !title) return null;

      return {
        id,
        title,
        author: author || "unknown",
        subreddit,
        // The feed simply doesn't carry these; the UI hides them when null.
        score: null,
        numComments: null,
        permalink: href ? decodeEntities(href) : null,
        createdUtc: published ? Date.parse(published) / 1000 : null,
        flair: null,
        stickied: false,
        nsfw: false,
      };
    })
    .filter(Boolean);
}

const rssCache = new Map();
const RSS_TTL_MS = 5 * 60 * 1000;

async function fetchViaRss(subreddit, limit) {
  const cached = rssCache.get(subreddit);

  if (cached && Date.now() - cached.at < RSS_TTL_MS) {
    return cached.posts;
  }

  const response = await fetch(
    `https://www.reddit.com/r/${encodeURIComponent(
      subreddit
    )}/hot.rss?limit=${limit}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" } }
  );

  if (!response.ok) return null;

  const posts = parseAtom(await response.text(), subreddit);

  if (posts.length === 0) return null;

  rssCache.set(subreddit, { at: Date.now(), posts });

  return posts;
}

/**
 * Fetch hot posts for a subreddit.
 *
 * Tries, in order:
 *   1. oauth.reddit.com  — full data, needs credentials
 *   2. the public .json  — full data, but Reddit 403s non-browser clients
 *   3. the Atom feed     — titles only, no score or comment count
 *
 * Tier 3 keeps the dashboard usable without credentials, since sentiment only
 * needs titles, but it rate limits hard so it is genuinely a last resort.
 */
export async function fetchHotPosts(rawSubreddit, limit = 50) {
  const subreddit = cleanSubredditName(rawSubreddit);

  if (!subreddit) {
    throw new RedditError(400, "Subreddit is required.");
  }

  if (!/^[A-Za-z0-9_]{2,21}$/.test(subreddit)) {
    throw new RedditError(400, "That doesn't look like a valid subreddit name.");
  }

  const mode = credentialsReady ? "oauth" : "anonymous";

  const response = credentialsReady
    ? await fetchAuthenticated(subreddit, limit)
    : await fetchAnonymous(subreddit, limit);

  if (response.ok) {
    const data = await response.json();
    const children = data?.data?.children || [];

    if (children.length > 0) {
      const posts = normalize(children);
      return { subreddit, count: posts.length, posts, mode };
    }
  }

  // 404 is authoritative — the feed won't have it either.
  if (response.status === 404) {
    throw new RedditError(404, `r/${subreddit} doesn't exist.`);
  }

  // With credentials a 403 means the sub really is private, not that Reddit
  // dislikes our client, so don't paper over it with the feed.
  if (response.status === 403 && credentialsReady) {
    throw new RedditError(403, `r/${subreddit} is private or quarantined.`);
  }

  const rssPosts = await fetchViaRss(subreddit, limit);

  if (rssPosts) {
    return {
      subreddit,
      count: rssPosts.length,
      posts: rssPosts,
      mode: "rss",
      degraded: "Score and comment counts aren't available from Reddit's feed.",
    };
  }

  if (response.status === 429) {
    throw new RedditError(
      429,
      "Reddit is rate limiting us. Wait a moment and try again."
    );
  }

  if (response.status === 403) {
    throw new RedditError(
      403,
      "Reddit blocked this request and its feed is rate limited. Add Reddit " +
        "API credentials — see the README."
    );
  }

  if (!response.ok) {
    throw new RedditError(502, `Reddit request failed (${response.status}).`);
  }

  throw new RedditError(404, `r/${subreddit} has no posts, or doesn't exist.`);
}
