import { EventEmitter } from 'events';

const bus = new EventEmitter();
bus.setMaxListeners(1000);

export type SpaceLiveEvent = Record<string, unknown> & {
  spaceId: string;
  type: string;
  timestamp: string;
  eventId?: string;
};

export function publishLocalSpaceEvent(event: SpaceLiveEvent) {
  bus.emit(`space:${event.spaceId}`, event);
}

export function subscribeToLocalSpaceEvents(spaceId: string, listener: (event: SpaceLiveEvent) => void) {
  const channel = `space:${spaceId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}
