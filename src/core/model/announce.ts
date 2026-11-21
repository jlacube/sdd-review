/**
 * The cloud-use state of C001-IF-010 §6 check 5 (C001-REQ-807, C001-REQ-808): before the first
 * request of a process to a cloud provider, the gateway emits a cloud-use event. The CLI prints
 * the announcement of C001-IF-001 §Output on standard error when it receives it; the UI reads the
 * provider of `SessionInfo.providerStatus` (C001-IF-002) for its banner (C001-T-091) and can ask
 * this state which providers have been sent content so far.
 *
 * One announcer belongs to one opened core, that is one process of the CLI (`api/open.ts`), and is
 * shared by the gateways of all its snapshots, so each cloud provider is announced once per process.
 */

/** A cloud provider that is about to receive repository content. */
export interface CloudUseEvent {
  /** The provider name of the review configuration (C001-IF-004 `model.provider.name`). */
  readonly provider: string;
  /** The endpoint's host, as `locality.ts` reads it from the endpoint text. */
  readonly host: string;
}

export type CloudUseListener = (event: CloudUseEvent) => void;

/** The announcement line of C001-IF-001 §Output (C001-REQ-808), without the line end. */
export function cloudAnnouncement(event: CloudUseEvent): string {
  return `Repository content is sent to model provider "${event.provider}" at ${event.host}.`;
}

export class CloudUseAnnouncer {
  private readonly listeners = new Set<CloudUseListener>();
  private readonly announced = new Map<string, CloudUseEvent>();

  /** Adds a listener; returns the function that removes it. */
  subscribe(listener: CloudUseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Called by the gateway right before a request to a cloud provider is sent. The first call for a
   * provider and host emits the event to every listener, synchronously, before it returns; later
   * calls for the same provider and host emit nothing. Returns true when the event was emitted.
   * A listener that throws does not stop the others.
   */
  announce(event: CloudUseEvent, onListenerError?: (error: unknown) => void): boolean {
    const key = `${event.provider}\u0000${event.host}`;
    if (this.announced.has(key)) return false;
    const copy: CloudUseEvent = { provider: event.provider, host: event.host };
    this.announced.set(key, copy);
    for (const listener of this.listeners) {
      try {
        listener(copy);
      } catch (error) {
        onListenerError?.(error);
      }
    }
    return true;
  }

  /** The cloud providers announced so far in this process, in the order of their first request. */
  events(): readonly CloudUseEvent[] {
    return [...this.announced.values()];
  }
}
