function upper(value) {
  return String(value || '').trim().toUpperCase();
}

export function selectLatestReviewState(reviews = []) {
  if (!Array.isArray(reviews) || reviews.length === 0) return null;
  const sorted = reviews
    .filter(review => review?.state)
    .sort((a, b) => new Date(b.submitted_at || b.updated_at || 0) - new Date(a.submitted_at || a.updated_at || 0));
  const latest = sorted[0];
  if (!latest) return null;
  return {
    state: upper(latest.state),
    author: latest.user?.login || null,
    submittedAt: latest.submitted_at || latest.updated_at || null,
  };
}

export async function fetchGitHubPullRequestState({ repo, prNumber, token }) {
  if (!repo || !prNumber || !token) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Homebase-Agent',
  };

  const [prRes, reviewsRes] = await Promise.all([
    fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`, { headers }),
    fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`, { headers }),
  ]);

  if (!prRes.ok) return null;
  const pr = await prRes.json();
  const reviews = reviewsRes.ok ? await reviewsRes.json() : [];
  const latestReview = selectLatestReviewState(reviews);
  return {
    prState: pr.merged ? 'merged' : pr.state,
    merged: Boolean(pr.merged),
    mergedAt: pr.merged_at || null,
    reviewState: latestReview?.state || null,
    reviewAuthor: latestReview?.author || null,
    reviewSubmittedAt: latestReview?.submittedAt || null,
  };
}

export async function fetchGitHubPullRequestFiles({ repo, prNumber, token }) {
  if (!repo || !prNumber || !token) return [];
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Homebase-Agent',
  };
  const files = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`,
      { headers }
    );
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    files.push(...batch.map(file => file.filename).filter(Boolean));
    if (batch.length < 100) break;
  }
  return files;
}
