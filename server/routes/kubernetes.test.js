import request from 'supertest';
import { jest } from '@jest/globals';
import express from 'express';

// Mock the runtimeMode middleware to bypass the local filesystem check
jest.unstable_mockModule('../middleware/runtimeMode.js', () => ({
  requireLocalFilesystem: (req, res, next) => next(),
  getRuntimeMode: () => 'desktop',
}));

// Create a mock client
const mockListNamespace = jest.fn();
const mockListPodForAllNamespaces = jest.fn();
const mockListDeploymentForAllNamespaces = jest.fn();

const mockMakeApiClient = jest.fn((apiClientType) => {
  if (apiClientType.name === 'CoreV1Api') {
    return {
      listNamespace: mockListNamespace,
      listPodForAllNamespaces: mockListPodForAllNamespaces,
    };
  }
  if (apiClientType.name === 'AppsV1Api') {
    return {
      listDeploymentForAllNamespaces: mockListDeploymentForAllNamespaces,
    };
  }
  return {};
});

const mockLoadFromDefault = jest.fn();
const mockGetCurrentCluster = jest.fn();

jest.unstable_mockModule('@kubernetes/client-node', () => {
  class KubeConfig {
    loadFromDefault = mockLoadFromDefault;
    getCurrentCluster = mockGetCurrentCluster;
    makeApiClient = mockMakeApiClient;
  }
  return {
    KubeConfig,
    CoreV1Api: class CoreV1Api { static name = 'CoreV1Api'; },
    AppsV1Api: class AppsV1Api { static name = 'AppsV1Api'; },
  };
});

describe('Kubernetes API Router', () => {
  let app;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Import router dynamically after setting up mocks
    const { kubernetesRouter } = await import('./kubernetes.js');
    app = express();
    app.use('/api', kubernetesRouter);
  });

  it('GET /api/kubernetes/status should return 503 if no kubeconfig is found', async () => {
    mockLoadFromDefault.mockImplementation(() => {
      throw new Error('No config found');
    });

    const res = await request(app).get('/api/kubernetes/status');
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Not configured');
  });

  it('GET /api/kubernetes/status should return 503 if no cluster is current', async () => {
    mockLoadFromDefault.mockImplementation(() => {});
    mockGetCurrentCluster.mockReturnValue(null);

    const res = await request(app).get('/api/kubernetes/status');
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Not configured');
  });

  it('GET /api/kubernetes/status should return valid read-only cluster data', async () => {
    mockLoadFromDefault.mockImplementation(() => {});
    mockGetCurrentCluster.mockReturnValue({ name: 'test-cluster' });

    mockListNamespace.mockResolvedValue({
      body: {
        items: [{ metadata: { name: 'default', creationTimestamp: '2023-01-01T00:00:00Z' }, status: { phase: 'Active' } }]
      }
    });

    mockListPodForAllNamespaces.mockResolvedValue({
      body: {
        items: [{
          metadata: { name: 'nginx-pod', namespace: 'default', creationTimestamp: '2023-01-01T00:00:00Z' },
          status: { phase: 'Running', containerStatuses: [{ restartCount: 1 }] }
        }]
      }
    });

    mockListDeploymentForAllNamespaces.mockResolvedValue({
      body: {
        items: [{
          metadata: { name: 'nginx-deployment', namespace: 'default', creationTimestamp: '2023-01-01T00:00:00Z' },
          spec: { replicas: 3 },
          status: { readyReplicas: 3, availableReplicas: 3 }
        }]
      }
    });

    const res = await request(app).get('/api/kubernetes/status');
    expect(res.statusCode).toBe(200);

    expect(res.body.namespaces).toHaveLength(1);
    expect(res.body.namespaces[0].name).toBe('default');

    expect(res.body.pods).toHaveLength(1);
    expect(res.body.pods[0].name).toBe('nginx-pod');
    expect(res.body.pods[0].restarts).toBe(1);

    expect(res.body.deployments).toHaveLength(1);
    expect(res.body.deployments[0].name).toBe('nginx-deployment');
    expect(res.body.deployments[0].replicas).toBe(3);
  });

  it('should not allow non-GET requests', async () => {
     const resPost = await request(app).post('/api/kubernetes/status');
     expect(resPost.statusCode).toBe(404); // the route is only registered for GET

     const resPut = await request(app).put('/api/kubernetes/status');
     expect(resPut.statusCode).toBe(404);

     const resDelete = await request(app).delete('/api/kubernetes/status');
     expect(resDelete.statusCode).toBe(404);
  });
});
