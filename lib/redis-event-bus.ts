import { getRedisSubscriber } from '@/lib/redis';
import { publishLocalSpaceEvent } from '@/lib/space-live-events';

let isInitialized = false;
let listenersAttached = false;

export function initRedisEventBus() {
  try {
    const sub = getRedisSubscriber();
    if (!sub) return;

    if (!listenersAttached) {
      listenersAttached = true;
      sub.on('pmessage', (_pattern, _channel, message) => {
        try {
          const event = JSON.parse(message);
          publishLocalSpaceEvent(event);
        } catch {
          // malformed message, skip
        }
      });
    }

    if (isInitialized || sub.status === 'ready' || sub.status === 'connecting') return;

    sub.connect().then(() => {
      isInitialized = true;
      sub.psubscribe('space:*:events').catch(() => {
        isInitialized = false;
      });
    }).catch(() => {
      isInitialized = false;
    });
  } catch {
    // Redis not available
  }
}
