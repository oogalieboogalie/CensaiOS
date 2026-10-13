/**
 * Statistical utilities for scalar and embedding drift detection.
 */

export function applyPCA(embedding, components, mean = []) {
  const centered = embedding.map((value, index) => value - (mean[index] || 0));
  return components.map(component => {
    return component.reduce((sum, weight, index) => sum + weight * (centered[index] || 0), 0);
  });
}

function rbfKernel(left, right, gamma) {
  const length = Math.min(left.length, right.length);
  let distanceSquared = 0;

  for (let index = 0; index < length; index += 1) {
    const diff = left[index] - right[index];
    distanceSquared += diff * diff;
  }

  return Math.exp(-gamma * distanceSquared);
}

function averagePairKernel(samples, gamma) {
  if (samples.length < 2) return 0;

  let total = 0;
  for (let left = 0; left < samples.length; left += 1) {
    for (let right = 0; right < samples.length; right += 1) {
      if (left !== right) total += rbfKernel(samples[left], samples[right], gamma);
    }
  }

  return total / (samples.length * (samples.length - 1));
}

function averageCrossKernel(leftSamples, rightSamples, gamma) {
  if (!leftSamples.length || !rightSamples.length) return 0;

  let total = 0;
  for (const left of leftSamples) {
    for (const right of rightSamples) {
      total += rbfKernel(left, right, gamma);
    }
  }

  return total / (leftSamples.length * rightSamples.length);
}

export function calculateMMD(referenceSamples, currentSamples, sigma = 1) {
  if (referenceSamples.length < 2 || currentSamples.length < 2) return 0;

  const gamma = 1 / (2 * sigma * sigma);
  const referenceKernel = averagePairKernel(referenceSamples, gamma);
  const currentKernel = averagePairKernel(currentSamples, gamma);
  const crossKernel = averageCrossKernel(referenceSamples, currentSamples, gamma);

  return Math.max(0, referenceKernel + currentKernel - 2 * crossKernel);
}

export function calculateScalarDrift(features, baseline = {}) {
  const results = {};

  for (const [name, stats] of Object.entries(baseline.features || {})) {
    const incomingValue = features[name];
    if (incomingValue === undefined) continue;

    const score = stats.std > 0 ? Math.abs(incomingValue - stats.mean) / stats.std : 0;
    results[name] = { score, value: incomingValue, baselineMean: stats.mean };
  }

  return results;
}

function maxDriftScore(driftResults) {
  const scores = Object.values(driftResults).map(result => result.score);
  return scores.length ? Math.max(...scores) : 0;
}

function projectEmbedding(embedding, baseline) {
  if (!Array.isArray(baseline.pcaComponents)) return embedding;
  return applyPCA(embedding, baseline.pcaComponents, baseline.pcaMean || []);
}

export function calculateDriftState({ features, baseline = {}, deploymentData = {} }) {
  const driftResults = calculateScalarDrift(features, baseline);
  const nextData = {};

  if (Array.isArray(features.embedding)) {
    const currentVector = projectEmbedding(features.embedding, baseline);
    const buffer = [...(deploymentData.buffer || []), currentVector];
    const windowSize = deploymentData.windowSize || baseline.windowSize || 10;

    if (buffer.length >= windowSize) {
      nextData.buffer = [];
      if (Array.isArray(baseline.referenceSet)) {
        const score = calculateMMD(baseline.referenceSet, buffer, baseline.sigma || 1);
        driftResults.embedding_mmd = { score, value: 'batch_slice' };
      }
    } else {
      nextData.buffer = buffer;
    }
  }

  return {
    driftResults,
    maxDrift: maxDriftScore(driftResults),
    nextData,
  };
}

export function buildMLOpsWebhookBody(hook, { deploymentId, alertId, maxDrift, driftResults }) {
  if (hook.type === 'slack') {
    return {
      text: `ML Drift Alert: ${maxDrift.toFixed(4)}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*ML Drift Alert detected for deployment ${deploymentId}*` },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Max Drift Score:*\n${maxDrift.toFixed(4)}` },
            { type: 'mrkdwn', text: '*Status:*\nOpen' },
          ],
        },
      ],
    };
  }

  if (hook.type === 'pagerduty') {
    return {
      event_action: 'trigger',
      routing_key: hook.routingKey,
      payload: {
        summary: `ML Drift Alert: ${maxDrift.toFixed(4)} for ${deploymentId}`,
        severity: maxDrift > 0.5 ? 'critical' : 'warning',
        source: 'censai-mlops-drift-detector',
        custom_details: { deploymentId, driftResults },
      },
    };
  }

  return { deploymentId, alertId, maxDrift, driftResults };
}
