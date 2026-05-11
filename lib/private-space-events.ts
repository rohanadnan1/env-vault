type SpaceMoveEvent = {
  type: 'file-moved';
  spaceId: string;
  actorMemberId: string;
  actorName: string;
  actorUserId: string;
  userFileId: string;
  kingFileId: string | null;
  fileName: string;
  oldFolderPath: string;
  newFolderPath: string;
  timestamp: string;
};

export type PrivateSpaceEvent = SpaceMoveEvent;

type Listener = (event: PrivateSpaceEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function publishPrivateSpaceEvent(event: PrivateSpaceEvent) {
  const targetListeners = listeners.get(event.spaceId);
  if (!targetListeners) return;
  for (const listener of targetListeners) {
    listener(event);
  }
}

export function subscribeToPrivateSpaceEvents(spaceId: string, listener: Listener) {
  const targetListeners = listeners.get(spaceId) ?? new Set<Listener>();
  targetListeners.add(listener);
  listeners.set(spaceId, targetListeners);

  return () => {
    const current = listeners.get(spaceId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(spaceId);
  };
}
