import { fetchGithub } from './shared.js';

export async function listRepos(req, res) {
  const data = await fetchGithub('/user/repos?sort=updated&per_page=100', res);
  if (data) {
    const filtered = data.map(r => ({
      name: r.full_name,
      description: r.description,
      updated_at: r.updated_at
    }));
    res.json(filtered);
  }
}
