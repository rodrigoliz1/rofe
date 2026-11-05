import { apiFetch } from './api';

export function subscribeToEvents(onEvent: (event: unknown) => void, onConnection: (connected: boolean) => void): () => void {
  const controller = new AbortController();
  let retryTimer: number | undefined;
  let attempts = 0;

  const connect = async () => {
    try {
      const response = await apiFetch('/api/events', { signal: controller.signal }, true);
      if (!response.ok || !response.body) throw new Error('event stream unavailable');
      attempts = 0;
      if (controller.signal.aborted) return;
      onConnection(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.split('\n').find((candidate) => candidate.startsWith('data:'));
          if (line) {
            try { onEvent(JSON.parse(line.slice(5).trim()) as unknown); } catch { /* Ignore a malformed frame; reconnecting must not lose the rest. */ }
          }
        }
      }
      if (!controller.signal.aborted) throw new Error('event stream closed');
    } catch {
      if (!controller.signal.aborted) onConnection(false);
      if (!controller.signal.aborted) {
        const delay = Math.min(30_000, 1_000 * 2 ** attempts++) + Math.floor(Math.random() * 500);
        retryTimer = window.setTimeout(connect, delay);
      }
    }
  };

  void connect();
  return () => {
    controller.abort();
    if (retryTimer) window.clearTimeout(retryTimer);
  };
}
