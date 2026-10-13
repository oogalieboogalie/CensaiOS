import { startVideo, waitForVideo } from '../../video/service.js';

function describe(job) {
  if (job.status === 'ready') return { status: 'ready', video_id: job.id, url: job.url, markdown: `[Watch the video](${job.url})` };
  if (job.status === 'failed') return { status: 'failed', video_id: job.id, error: job.error };
  return { status: 'working', video_id: job.id, note: 'Still being made. Call video_status again in a minute.' };
}

export async function handleVideoTool(agentId, name, args = {}, context = {}, deps = {}) {
  const who = { userId: context.userId ?? null, workspaceId: context.workspaceId || null, userRole: context.userRole || null };
  try {
    if (name === 'make_video') {
      const job = await startVideo({
        prompt: args.prompt,
        aspectRatio: args.aspect_ratio,
        negativePrompt: args.negative_prompt,
        fast: Boolean(args.fast),
        agentId,
        ...who,
      }, deps);
      return JSON.stringify({ status: 'working', video_id: job.id, model: job.model, note: 'Video started. It takes one to several minutes; call video_status with this video_id.' });
    }
    if (name === 'video_status') {
      const job = await waitForVideo({ id: args.video_id, ...who }, { waitSeconds: args.wait_seconds ?? 45, ...deps });
      return JSON.stringify(describe(job));
    }
    return JSON.stringify({ error: `Unknown video tool: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: err.message, code: err.code || 'VIDEO_FAILED' });
  }
}
