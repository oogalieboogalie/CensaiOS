import express from 'express';
import { requireLocalFilesystem } from '../middleware/runtimeMode.js';
import * as k8s from '@kubernetes/client-node';

export const kubernetesRouter = express.Router();

// @kubernetes/client-node 1.x and later answer with the list itself; older
// versions wrapped it in { body }. Reading `.body.items` on the new shape
// crashed, so the window never showed a real cluster.
const itemsOf = (res) => (res?.body ?? res)?.items || [];

// GET /api/kubernetes/status
kubernetesRouter.get('/kubernetes/status', requireLocalFilesystem, async (req, res) => {
  try {
    const kc = new k8s.KubeConfig();
    try {
      kc.loadFromDefault();
    } catch (e) {
      return res.status(503).json({ error: 'Not configured', message: 'No valid kubeconfig found' });
    }

    // Try to get a cluster to see if it's configured. loadFromDefault() might succeed but have empty clusters.
    const cluster = kc.getCurrentCluster();
    if (!cluster) {
      return res.status(503).json({ error: 'Not configured', message: 'No current cluster found in kubeconfig' });
    }

    const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);
    const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);

    // Fetch namespaces
    const namespacesRes = await k8sCoreApi.listNamespace();
    const namespaces = itemsOf(namespacesRes).map(ns => ({
      name: ns.metadata.name,
      status: ns.status.phase,
      age: ns.metadata.creationTimestamp
    }));

    // Fetch pods (all namespaces)
    const podsRes = await k8sCoreApi.listPodForAllNamespaces();
    const pods = itemsOf(podsRes).map(pod => ({
      name: pod.metadata.name,
      namespace: pod.metadata.namespace,
      status: pod.status.phase,
      restarts: pod.status.containerStatuses ? pod.status.containerStatuses.reduce((acc, c) => acc + c.restartCount, 0) : 0,
      age: pod.metadata.creationTimestamp
    }));

    // Fetch deployments (all namespaces)
    const deploymentsRes = await k8sAppsApi.listDeploymentForAllNamespaces();
    const deployments = itemsOf(deploymentsRes).map(dep => ({
      name: dep.metadata.name,
      namespace: dep.metadata.namespace,
      readyReplicas: dep.status.readyReplicas || 0,
      replicas: dep.spec.replicas,
      availableReplicas: dep.status.availableReplicas || 0,
      age: dep.metadata.creationTimestamp
    }));

    res.json({ namespaces, pods, deployments });

  } catch (err) {
    // Check if error is from k8s client connection failure
    // The current client uses fetch: a cluster that is off says "fetch failed"
    // with the real code on err.cause.
    const code = err.code || err.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || /ECONNREFUSED|fetch failed/.test(err.message || '')) {
        return res.status(503).json({ error: 'Connection failed', message: 'Could not connect to the Kubernetes cluster' });
    }
    if (err.message && err.message.includes('HTTP protocol is not allowed')) {
        return res.status(503).json({ error: 'Not configured', message: 'No valid kubeconfig found (HTTP not allowed)' });
    }
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});
