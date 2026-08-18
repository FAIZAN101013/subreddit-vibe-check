import Sentiment from "sentiment";

const analyzer = new Sentiment();

// AFINN was built for prose, so a few Reddit-isms are worth teaching it.
const extraWords = {
  banned: -2,
  bug: -2,
  broken: -3,
  buggy: -2,
  crash: -3,
  crashed: -3,
  cringe: -2,
  drama: -2,
  glitch: -2,
  layoffs: -4,
  lawsuit: -3,
  outage: -3,
  scam: -4,
  shutdown: -2,
  goat: 3,
  hype: 2,
  underrated: 2,
  wholesome: 3,
};

// Comparative score = total score / word count, so long titles aren't
// automatically louder than short ones. These cutoffs keep mild wording
// ("a small issue") in neutral instead of flipping it to negative.
const POSITIVE_CUTOFF = 0.08;
const NEGATIVE_CUTOFF = -0.08;

export function analyzeTitle(title) {
  const result = analyzer.analyze(title, { extras: extraWords });

  let label = "neutral";

  if (result.comparative > POSITIVE_CUTOFF) {
    label = "positive";
  } else if (result.comparative < NEGATIVE_CUTOFF) {
    label = "negative";
  }

  return {
    label,
    score: result.score,
    comparative: Number(result.comparative.toFixed(3)),
    positiveWords: result.positive,
    negativeWords: result.negative,
  };
}

export function summarize(analyzedPosts) {
  const counts = { positive: 0, neutral: 0, negative: 0 };

  analyzedPosts.forEach((post) => {
    counts[post.sentiment.label] += 1;
  });

  const total = analyzedPosts.length;

  const averageComparative =
    total === 0
      ? 0
      : analyzedPosts.reduce((sum, p) => sum + p.sentiment.comparative, 0) /
        total;

  let overall = "neutral";

  if (counts.positive > counts.negative * 1.25) {
    overall = "positive";
  } else if (counts.negative > counts.positive * 1.25) {
    overall = "negative";
  }

  return {
    total,
    ...counts,
    overall,
    averageComparative: Number(averageComparative.toFixed(3)),
    percentages: {
      positive: total ? Math.round((counts.positive / total) * 100) : 0,
      neutral: total ? Math.round((counts.neutral / total) * 100) : 0,
      negative: total ? Math.round((counts.negative / total) * 100) : 0,
    },
  };
}

export const SENTIMENT_META = {
  positive: { emoji: "🟢", label: "Positive" },
  neutral: { emoji: "⚪", label: "Neutral" },
  negative: { emoji: "🔴", label: "Negative" },
};
