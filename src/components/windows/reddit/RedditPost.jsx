/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';

/** One public-feed card for the web-browser fallback (desktop uses the live site). */
export function RedditPost({ post }) {
  if (!post) return null;
  return (
    <article className="hb-reddit-post" data-testid="reddit-post">
      <div className="hb-reddit-post-meta">
        <span>r/{post.subreddit}</span>
        {post.author ? <span>u/{post.author}</span> : null}
        <span>{post.score} pts</span>
      </div>
      <h2 className="hb-reddit-post-title">{post.title}</h2>
      {post.kind === 'image' && post.image && (
        <img className="hb-reddit-media" src={post.image} alt="" loading="lazy" />
      )}
      {post.kind === 'video' && post.video && (
        <video className="hb-reddit-media" src={post.video} controls playsInline muted />
      )}
      {post.kind === 'text' && post.selftext && <p className="hb-reddit-self">{post.selftext}</p>}
      <a className="hb-reddit-open" href={post.permalink} target="_blank" rel="noopener noreferrer">Open on Reddit</a>
    </article>
  );
}
