import { useState } from "react";
import "./App.css";

function App() {
  const [subreddit, setSubreddit] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    console.log("Subreddit:", subreddit);
  };

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">REDDIT SENTIMENT ANALYZER</p>

        <h1>
          The Subreddit
          <span> Vibe Check</span>
        </h1>

        <p className="description">
          Discover the mood of a subreddit by analyzing the sentiment
          of its hottest posts.
        </p>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <span className="reddit-prefix">r/</span>

            <input
              type="text"
              placeholder="Enter a subreddit..."
              value={subreddit}
              onChange={(e) => setSubreddit(e.target.value)}
            />
          </div>

          <button type="submit">
            Check Vibe
          </button>
        </form>
      </header>

      <main>
        <section className="stats">
          <div className="stat-card">
            <span className="stat-number">—</span>
            <span className="stat-label">Posts Analyzed</span>
          </div>

          <div className="stat-card">
            <span className="stat-number positive">—</span>
            <span className="stat-label">Positive</span>
          </div>

          <div className="stat-card">
            <span className="stat-number neutral">—</span>
            <span className="stat-label">Neutral</span>
          </div>

          <div className="stat-card">
            <span className="stat-number negative">—</span>
            <span className="stat-label">Negative</span>
          </div>
        </section>

        <section className="posts-section">
          <div className="section-header">
            <div>
              <p className="section-label">HOT POSTS</p>
              <h2>Latest subreddit activity</h2>
            </div>
          </div>

          <div className="empty-state">
            <div className="empty-icon">◎</div>
            <h3>Choose a subreddit</h3>
            <p>
              Enter a subreddit above to analyze its top 50 hot posts.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;