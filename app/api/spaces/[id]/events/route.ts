import { auth } from '@/lib/auth';
import { requireSpaceMembership } from '@/lib/private-space';
import { initRedisEventBus } from '@/lib/redis-event-bus';
import { subscribeToLocalSpaceEvents } from '@/lib/space-live-events';

let busInitialized = false;

function ensureBusReady() {
  if (!busInitialized) {
    busInitialized = true;
    try { initRedisEventBus(); } catch { /* noop */ }
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) {
    return new Response('Not found', { status: 404 });
  }

  ensureBusReady();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected', spaceId, timestamp: new Date().toISOString() })}\n\n`));
      const seenEventIds = new Set<string>();

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 15_000);

      const forwardEvent = (event: Record<string, unknown>) => {
        if (event.actorUserId === session.user?.id) return;
        const eventId = typeof event.eventId === 'string' ? event.eventId : null;
        if (eventId) {
          if (seenEventIds.has(eventId)) return;
          seenEventIds.add(eventId);
          if (seenEventIds.size > 100) {
            const oldest = seenEventIds.values().next().value;
            if (oldest) seenEventIds.delete(oldest);
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const unsubscribe = subscribeToLocalSpaceEvents(spaceId, forwardEvent);

      const handleAbort = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try { controller.close(); } catch { /* closed */ }
      };

      req.signal.addEventListener('abort', handleAbort, { once: true });
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
