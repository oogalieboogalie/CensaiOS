// Where censaiOS asks GitHub's REST API: GitHub itself, or the address
// CENSAI_GITHUB_API_URL names (the test team's stand-in GitHub).
export const githubApiUrl = () => process.env.CENSAI_GITHUB_API_URL || 'https://api.github.com';
