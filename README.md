# The Subreddit Vibe Check

Enter a subreddit, fetch its 50 hot posts, and score every title's sentiment
client-side to read the room.

**Live demo:** <https://subreddit-vibe-check-nu.vercel.app/>

**[Engineering notes →](./ENGINEERING_NOTES.md)** — how Reddit blocked every
documented endpoint, the test that disproved the obvious explanation, and why
the architecture ended up with three fallback tiers.

- 🟢 Positive / ⚪ Neutral / 🔴 Negative badge on every post
- Summary statistics and a sentiment distribution chart
- Filter the feed by sentiment
- Score, comment count, flair, and a link back to Reddit on each card
- Loading skeletons, and distinct errors for invalid, private, and missing subs

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + Vite |
| Sentiment | [`sentiment`](https://github.com/thisandagain/sentiment) (AFINN-165), run in the browser |
| API | Serverless function on Vercel (`api/reddit.js`), Express for local dev |

## How it reaches Reddit

Reddit fingerprints non-browser HTTP clients and returns **403 on the public
`.json` endpoints** for them, regardless of IP — verified from a residential
connection where the same URL loads fine in a logged-in browser. Fetching
reddit.com directly from the frontend doesn't work either: those endpoints send
no `Access-Control-Allow-Origin`, and a cross-origin request can't carry the
session cookies that make them answer.

So `api/_reddit.js` tries three sources in order:

| Tier | Source | Data |
| --- | --- | --- |
| 1 | `oauth.reddit.com` | Full — needs credentials |
| 2 | `www.reddit.com/…/hot.json` | Full — 403s for non-browser clients |
| 3 | `www.reddit.com/…/hot.rss` | Titles, authors, links — no score or comments |

Tier 3 keeps the dashboard working with no credentials at all, since sentiment
analysis only needs titles. The UI hides the score and comment count when
they're absent and says which source it used. The feed rate limits hard, so
results are cached for five minutes.

Sentiment analysis runs client-side on every tier, as specified.

## Setup

### 1. Reddit API credentials (optional, and currently unavailable)

Tier 1 needs a `script` app from <https://www.reddit.com/prefs/apps>. Reddit now
gates this behind a Data API access review, and **the application for this
project was declined** under their Responsible Builder Policy — so the deployed
app runs on tier 3.

If you have approved credentials, drop them into `server/.env` (copy
`server/.env.example`) or into your host's environment variables and the code
prefers tier 1 automatically. Nothing else changes. That restores score and
comment counts, and removes the rate limit entirely.

```
REDDIT_CLIENT_ID=...
REDDIT_CLIENT_SECRET=...
REDDIT_USERNAME=...
REDDIT_PASSWORD=...
```

`server/.env` is gitignored — never commit it.

### 2. Known limitation without credentials

Reddit's Atom feed rate limits per source IP, and serverless functions run from
a shared pool. In practice:

- The six suggested subreddits load instantly — each successful response is
  held at the edge for 24 hours via `stale-while-revalidate`.
- A subreddit nobody has fetched recently may hit the rate limit. The client
  retries up to four times, 1.8s apart; because each request can be served by a
  different instance with its own limit, retrying often succeeds.
- If it still fails, the message says so plainly and suggests trying another.

### 3. Run locally

```bash
npm install
cd server && npm install && cd ..

# terminal 1 — API on :5000
cd server && npm start

# terminal 2 — dashboard on :5173
npm run dev
```

Vite proxies `/api` to `localhost:5000`, so the frontend uses the same relative
path in development and production. Visit
<http://localhost:5000/api/health> to confirm the credentials were picked up.

## Deploying to Vercel

The repo is laid out so one Vercel project serves both halves — `dist/` as the
static site and `api/reddit.js` as a serverless function on the same origin, so
there's no CORS configuration and no API base URL to set.

```bash
npm i -g vercel
vercel
```

Then add the four `REDDIT_*` values under **Project → Settings → Environment
Variables** (Production + Preview) and redeploy:

```bash
vercel --prod
```

Vercel auto-detects Vite; no `vercel.json` is needed. Files prefixed with `_`
(like `api/_reddit.js`) are treated as shared code, not as routes.

## API

| Route | Description |
| --- | --- |
| `GET /api/reddit?subreddit=technology` | 50 hot posts, normalized |
| `GET /api/health` | Local dev only — reports whether credentials loaded |

Errors map to real causes: `400` malformed name, `403` private or quarantined,
`404` nonexistent, `429` rate limited, `502` upstream failure.

## Sentiment scoring

`src/sentiment.js` runs AFINN over each title and classifies on the
**comparative** score (total ÷ word count, so long titles aren't automatically
louder than short ones):

| Comparative | Label |
| --- | --- |
| `> 0.08` | 🟢 Positive |
| `-0.08` to `0.08` | ⚪ Neutral |
| `< -0.08` | 🔴 Negative |

AFINN was trained on prose, so a small `extraWords` dictionary teaches it terms
that carry weight on Reddit but aren't in the base lexicon — `layoffs`,
`outage`, `buggy`, `scam`, `wholesome`, `underrated`.
