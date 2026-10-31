// Where censaiOS asks GitHub's REST API: GitHub itself, or the address
// CENSAI_GITHUB_API_URL names (the test team's stand-in GitHub).
export const githubApiUrl = () => process.env.CENSAI_GITHUB_API_URL || 'https://api.github.com';

// Where git fetches a GitHub repository ("owner/name"): GitHub itself, or
// under the address CENSAI_GITHUB_GIT_URL names (the stand-in's repositories).
export const githubGitUrl = (fullRepo) => `${(process.env.CENSAI_GITHUB_GIT_URL || 'https://github.com').replace(/\/+$/, '')}/${fullRepo}.git`;
