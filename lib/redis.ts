import Redis from 'ioredis';
import { publishLocalSpaceEvent } from '@/lib/space-live-events';

const REDIS_URL = process.env.REDIS_URL;

function isRedisEnabled() {
  return !!REDIS_URL;
}

export function publishSpaceEvent(
  spaceId: string,
  type: string,
  payload: Record<string, unknown>
) {
  const event = {
    type,
    ...payload,
    spaceId,
    timestamp: new Date().toISOString(),
    eventId: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
  };
  publishLocalSpaceEvent(event);
  if (!isRedisEnabled()) return;
  try {
    const pub = getRedisPublisher();
    pub.publish(
      `space:${spaceId}:events`,
      JSON.stringify(event)
    ).catch(() => {});
  } catch {
    // Redis not available — silently skip
  }
}

let publisher: Redis | null = null;

function getRedisPublisher(): Redis {
  if (!publisher && REDIS_URL) {
    publisher = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy() { return null; },
      lazyConnect: true,
    });
  }
  return publisher!;
}

let subscriber: Redis | null = null;

export function getRedisSubscriber(): Redis | null {
  if (!isRedisEnabled()) return null;
  if (!subscriber && REDIS_URL) {
    subscriber = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy() { return null; },
      lazyConnect: true,
    });
  }
  return subscriber;
}
