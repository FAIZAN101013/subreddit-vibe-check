import { useMemo, useRef, useState } from "react";
import "./App.css";
import { analyzeTitle, summarize, SENTIMENT_META } from "./sentiment";
import { fetchHotPosts, VibeCheckError } from "./redditClient";

const SUGGESTIONS = [
  "technology",
  "programming",
  "AskReddit",
  "science",
  "gaming",
  "worldnews",
];

const OVERALL_COPY = {
  positive: "This subreddit is in a good mood.",
  neutral: "Pretty even-tempered right now.",
  negative: "The vibes are rough today.",
};

const LABELS = ["positive", "neutral", "negative"];

// 50 posts in one column is a long scroll, so show them ten at a time.
const PER_PAGE = 10;

function App() {
  const [subreddit, setSubreddit] = useState("");
  const [activeSubreddit, setActiveSubreddit] = useState("");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [source, setSource] = useState(null);
  const [degraded, setDegraded] = useState(null);
  const [page, setPage] = useState(1);
  const [retrying, setRetrying] = useState(null);
  const postsRef = useRef(null);

  const analyzedPosts = useMemo(
    () =>
      posts.map((post) => ({
        ...post,
        sentiment: analyzeTitle(post.title),
      })),
    [posts]
  );

  const stats = useMemo(() => summarize(analyzedPosts), [analyzedPosts]);

  const visiblePosts = useMemo(
    () =>
      filter === "all"
        ? analyzedPosts
        : analyzedPosts.filter((post) => post.sentiment.label === filter),
    [analyzedPosts, filter]
  );

  const totalPages = Math.max(1, Math.ceil(visiblePosts.length / PER_PAGE));

  // Filtering can shrink the list below the current page, so clamp rather than
  // render an empty page.
  const currentPage = Math.min(page, totalPages);
  const firstOnPage = (currentPage - 1) * PER_PAGE;

  const pagePosts = visiblePosts.slice(firstOnPage, firstOnPage + PER_PAGE);

  const runVibeCheck = async (rawName) => {
    const name = rawName.trim().replace(/^\/?r\//i, "");

    setLoading(true);
    setError(null);
    setPosts([]);
    setFilter("all");
    setPage(1);
    setSource(null);
    setDegraded(null);
    setRetrying(null);
    setActiveSubreddit(name);

    try {
      const {
        posts: fetched,
        source: usedSource,
        degraded: degradedNote,
      } = await fetchHotPosts(name, (attempt, of) =>
        setRetrying({ attempt, of })
      );

      setPosts(fetched);
      setSource(usedSource);
      setDegraded(degradedNote);
    } catch (err) {
      console.error(err);

      setError(
        err instanceof VibeCheckError
          ? { message: err.message, hint: err.hint }
          : { message: "Something went wrong.", hint: null }
      );
      setPosts([]);
    } finally {
      setLoading(false);
      setRetrying(null);
    }
  };

  const goToPage = (next) => {
    setPage(Math.min(Math.max(next, 1), totalPages));

    // Otherwise page 2 opens halfway down the list you were already scrolled to.
    postsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    runVibeCheck(subreddit);
  };

  const pickSuggestion = (name) => {
    setSubreddit(name);
    runVibeCheck(name);
  };

  const hasResults = analyzedPosts.length > 0;

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">REDDIT SENTIMENT ANALYZER</p>

        <h1>
          The Subreddit
          <span> Vibe Check</span>
        </h1>

        <p className="description">
          Discover the mood of a subreddit by analyzing the sentiment of its
          hottest posts.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <span className="reddit-prefix">r/</span>

            <input
              type="text"
              placeholder="Enter a subreddit..."
              value={subreddit}
              onChange={(event) => setSubreddit(event.target.value)}
              autoComplete="off"
              spellCheck="false"
            />
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Checking..." : "Check Vibe"}
          </button>
        </form>

        <div className="suggestions">
          {SUGGESTIONS.map((name) => (
            <button
              key={name}
              type="button"
              className="chip"
              onClick={() => pickSuggestion(name)}
              disabled={loading}
            >
              r/{name}
            </button>
          ))}
        </div>

        {error && (
          <div className="error-message" role="alert">
            <strong>{error.message}</strong>
            {error.hint && <span className="error-hint">{error.hint}</span>}
          </div>
        )}
      </header>

      <main>
        <section className="stats">
          <div className="stat-card">
            <span className="stat-number">{hasResults ? stats.total : "—"}</span>
            <span className="stat-label">Posts Analyzed</span>
          </div>

          <div className="stat-card">
            <span className="stat-number positive">
              {hasResults ? stats.positive : "—"}
            </span>
            <span className="stat-label">🟢 Positive</span>
          </div>

          <div className="stat-card">
            <span className="stat-number neutral">
              {hasResults ? stats.neutral : "—"}
            </span>
            <span className="stat-label">⚪ Neutral</span>
          </div>

          <div className="stat-card">
            <span className="stat-number negative">
              {hasResults ? stats.negative : "—"}
            </span>
            <span className="stat-label">🔴 Negative</span>
          </div>
        </section>

        {hasResults && (
          <section className="chart-panel">
            <div className="chart-header">
              <div>
                <p className="section-label">SENTIMENT DISTRIBUTION</p>
                <h2 className={`verdict ${stats.overall}`}>
                  {SENTIMENT_META[stats.overall].emoji}{" "}
                  {OVERALL_COPY[stats.overall]}
                </h2>
              </div>

              <div className="average">
                <span className="average-value">
                  {stats.averageComparative > 0 ? "+" : ""}
                  {stats.averageComparative}
                </span>
                <span className="stat-label">Avg. score</span>
              </div>
            </div>

            <div className="distribution-bar">
              {LABELS.map((label) => (
                <div
                  key={label}
                  className={`bar-segment ${label}`}
                  style={{ width: `${stats.percentages[label]}%` }}
                  title={`${stats[label]} ${label}`}
                />
              ))}
            </div>

            <div className="chart-legend">
              {LABELS.map((label) => (
                <div key={label} className="legend-item">
                  <span className={`legend-dot ${label}`} />
                  <span className="legend-label">
                    {SENTIMENT_META[label].label}
                  </span>
                  <strong>
                    {stats[label]}{" "}
                    <span className="legend-percent">
                      ({stats.percentages[label]}%)
                    </span>
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="posts-section" ref={postsRef}>
          <div className="section-header">
            <div>
              <p className="section-label">HOT POSTS</p>
              <h2>
                {hasResults
                  ? `Top ${stats.total} posts from r/${activeSubreddit}`
                  : "Latest subreddit activity"}
              </h2>

              {hasResults && source && (
                <p className="source-note">
                  {source === "rss"
                    ? `Via Reddit's feed — ${degraded}`
                    : "Via the Reddit API"}
                </p>
              )}
            </div>

            {hasResults && (
              <div className="filters">
                {["all", ...LABELS].map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`filter ${filter === option ? "active" : ""}`}
                    onClick={() => {
                      setFilter(option);
                      setPage(1);
                    }}
                  >
                    {option === "all"
                      ? `All ${stats.total}`
                      : `${SENTIMENT_META[option].emoji} ${stats[option]}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading && (
            <div className="posts-list">
              {retrying && (
                <p className="retry-note" role="status">
                  Reddit is busy — retrying ({retrying.attempt} of {retrying.of})
                </p>
              )}

              {Array.from({ length: 5 }).map((_, index) => (
                <div className="post-card skeleton" key={index}>
                  <div className="skeleton-line short" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line medium" />
                </div>
              ))}
            </div>
          )}

          {!loading && !error && !hasResults && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <h3>Choose a subreddit</h3>
              <p>Enter a subreddit above to analyze its top 50 hot posts.</p>
            </div>
          )}

          {!loading && hasResults && visiblePosts.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">◎</div>
              <h3>No {filter} posts</h3>
              <p>Nothing in this batch landed in that bucket.</p>
            </div>
          )}

          {!loading && visiblePosts.length > 0 && (
            <div className="posts-list">
              {pagePosts.map((post) => (
                <article className="post-card" key={post.id}>
                  {post.score !== null && (
                    <div className="post-score">
                      <span>▲</span>
                      <strong>{formatCount(post.score)}</strong>
                    </div>
                  )}

                  <div className="post-content">
                    <div className="post-meta">
                      <span className={`badge ${post.sentiment.label}`}>
                        {SENTIMENT_META[post.sentiment.label].emoji}{" "}
                        {SENTIMENT_META[post.sentiment.label].label}
                      </span>

                      <span>r/{post.subreddit}</span>

                      {post.numComments !== null && (
                        <>
                          <span>·</span>
                          <span>{formatCount(post.numComments)} comments</span>
                        </>
                      )}

                      {post.flair && <span className="flair">{post.flair}</span>}
                    </div>

                    <h3>{post.title}</h3>

                    <div className="post-footer">
                      <span>
                        u/{post.author} · score{" "}
                        {post.sentiment.comparative > 0 ? "+" : ""}
                        {post.sentiment.comparative}
                      </span>

                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View on Reddit ↗
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && totalPages > 1 && (
            <nav className="pager" aria-label="Post pages">
              <button
                type="button"
                className="pager-step"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ← Prev
              </button>

              <div className="pager-pages">
                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (number) => (
                    <button
                      key={number}
                      type="button"
                      className={`pager-page ${
                        number === currentPage ? "active" : ""
                      }`}
                      onClick={() => goToPage(number)}
                      aria-current={number === currentPage ? "page" : undefined}
                    >
                      {number}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                className="pager-step"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>

              <p className="pager-count">
                {firstOnPage + 1}–{firstOnPage + pagePosts.length} of{" "}
                {visiblePosts.length}
              </p>
            </nav>
          )}
        </section>
      </main>
    </div>
  );
}

function formatCount(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
}

export default App;
