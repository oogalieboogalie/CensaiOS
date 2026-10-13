import React from 'react';
import { transcribeSpeech } from '../../lib/chat.js';
import { classifyAttachment } from '../../lib/chat/modelCapabilities.js';
import { readFileAsDataUrl, dataUrlBytes } from '../../lib/chat/attachments.js';
import { useVoiceRecorder } from './useVoice.js';

/**
 * Pending attachments for one chat window: files checked against the model's
 * capability map as they're picked, plus the mic (a clip the model hears, or
 * dictation through the provider's speech-to-text).
 */
export function useChatAttachments({ capabilities, agentId, workspaceId, setDraft }) {
  const [attachments, setAttachments] = React.useState([]);
  const [attachError, setAttachError] = React.useState(null);

  const addFiles = React.useCallback(async (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setAttachError(null);
    const added = [];
    for (const file of files) {
      const verdict = classifyAttachment({ name: file.name, mime: file.type, size: file.size }, capabilities);
      if (!verdict.ok) { setAttachError(verdict.reason); continue; }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        added.push({ kind: verdict.kind, name: file.name || verdict.kind, mime: file.type || '', size: file.size, dataUrl });
      } catch {
        setAttachError(`Could not read ${file.name || 'that file'}.`);
      }
    }
    if (added.length) setAttachments(current => [...current, ...added]);
  }, [capabilities]);

  const removeAttachment = React.useCallback((index) => {
    setAttachments(current => current.filter((_, i) => i !== index));
  }, []);

  const handleVoiceClip = React.useCallback(async (wavDataUrl) => {
    setAttachError(null);
    if (capabilities.voiceInput === 'native') {
      setAttachments(current => [...current, {
        kind: 'audio', name: 'voice message.wav', mime: 'audio/wav', size: dataUrlBytes(wavDataUrl), dataUrl: wavDataUrl,
      }]);
      return;
    }
    if (capabilities.voiceInput === 'transcribe') {
      try {
        const text = await transcribeSpeech(agentId, wavDataUrl, { workspaceId });
        if (text) setDraft(current => (current.trim() ? `${current.trimEnd()} ${text}` : text));
        else setAttachError('No speech was picked up. Try again a little closer to the mic.');
      } catch (error) {
        setAttachError(error?.message || 'Could not transcribe that recording.');
      }
    }
  }, [capabilities.voiceInput, agentId, workspaceId]);

  const recorder = useVoiceRecorder({ onClip: handleVoiceClip, onError: setAttachError });

  return { attachments, setAttachments, attachError, setAttachError, addFiles, removeAttachment, recorder };
}
