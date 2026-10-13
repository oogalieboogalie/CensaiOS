// Video tool family. Google Veo is the first entry; it uses the person's own
// Google key. A clip takes one to several minutes, so make_video starts it and
// video_status collects it.
export const videoTools = [
  {
    type: 'function',
    function: {
      name: 'make_video',
      description: 'Make a short video clip (about 8 seconds, with sound) from a text description, using Google Veo and the person\'s own Google key. Returns a video id right away; the clip takes one to several minutes. Then call video_status with that id to get the link. Describe the scene, camera, style and any dialogue in the prompt.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What the video shows: subject, action, setting, camera movement, style, sound or dialogue' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], description: '16:9 landscape (default) or 9:16 vertical for phones' },
          negative_prompt: { type: 'string', description: 'Optional: things the video must not show' },
          fast: { type: 'boolean', description: 'Optional: use the faster, cheaper Veo model' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'video_status',
      description: 'Check a video started with make_video. Waits up to wait_seconds (default 45) for it to finish. When ready, returns a link to the clip you can share as a Markdown link.',
      parameters: {
        type: 'object',
        properties: {
          video_id: { type: 'string', description: 'The id make_video returned (vid_...)' },
          wait_seconds: { type: 'integer', description: 'How long to wait for it to finish, 0 to 120 (default 45)' },
        },
        required: ['video_id'],
      },
    },
  },
];
