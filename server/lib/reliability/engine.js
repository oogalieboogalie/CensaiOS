import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';

export async function loadConfig() {
  const configPath = path.resolve(process.cwd(), 'ai-reliability.yml');
  if (fs.existsSync(configPath)) {
    const file = fs.readFileSync(configPath, 'utf8');
    return yaml.load(file);
  }
  return {
    thresholds: { overall: 80, monolith_lines: 250, nesting_depth: 4 },
    weights: { monolith: 20, complexity: 30, security: 40, tests: 10 }
  };
}

export function scanFile(filePath, content, config, { hasTests = false } = {}) {
  const heuristics = {
    is_monolith: false,
    high_complexity: false,
    security_hotspots: 0,
    has_tests: hasTests,
    architectural_drift: false,
    semantic_mismatch: false,
  };

  const lines = content.split('\n');

  // 1. Monolith Check
  if (lines.length > config.thresholds.monolith_lines) {
    heuristics.is_monolith = true;
  }

  // 2. Complexity Check (Deep Nesting)
  // Better brace counter that ignores strings (simple prototype)
  let maxDepth = 0;
  let currentDepth = 0;
  const strippedContent = content.replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, '');

  for (const char of strippedContent) {
    if (char === '{') currentDepth++;
    if (char === '}') currentDepth--;
    if (currentDepth > maxDepth) maxDepth = currentDepth;
  }

  if (maxDepth > config.thresholds.nesting_depth) {
    heuristics.high_complexity = true;
  }

  // 3. Security Hotspots
  const securityPatterns = [
    /allowAllOrigins: true|cors: { origin: '\*' }/i,
    /createHash\('md5'\)|createHash\('sha1'\)/i,
    /password\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /apiKey\s*[:=]\s*['"][^'"]{8,}['"]/i,
    /where: {}|findAll\(\)/i,
    /eval\(.*\)/i,
    /dangerouslySetInnerHTML/i
  ];

  for (const pattern of securityPatterns) {
    if (pattern.test(content)) {
      heuristics.security_hotspots++;
    }
  }

  // 4. Architectural Drift (Prototype: check for prohibited patterns in certain files)
  if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) {
    if (content.includes('localStorage.getItem') || content.includes('localStorage.setItem')) {
      heuristics.architectural_drift = true; // Use Zustand store instead
    }
  }

  // 5. Semantic Mismatch (Prototype: check if function names match docstrings)
  const docstrings = content.match(/\/\*\*[\s\S]*?\*\//g) || [];
  for (const ds of docstrings) {
    const hasFetch = ds.toLowerCase().includes('fetch');
    const hasImplementation = content.includes('fetch(') || content.includes('axios.get');
    if (hasFetch && !hasImplementation) {
      // heuristics.semantic_mismatch = true;
    }
  }

  // Score Calculation
  let score = 100;
  if (heuristics.is_monolith) score -= config.weights.monolith;
  if (heuristics.high_complexity) score -= config.weights.complexity;
  if (heuristics.architectural_drift) score -= 10;

  const securityPenalty = Math.min(heuristics.security_hotspots * 10, config.weights.security);
  score -= securityPenalty;

  if (!heuristics.has_tests) score -= config.weights.tests;

  return {
    score: Math.max(0, score),
    heuristics
  };
}
