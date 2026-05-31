/** Tiny event emitter for cross-module game events. */

export type Listener<T> = (payload: T) => void;

export class EventBus<EventMap extends Record<string, unknown>> {
  private listeners: { [K in keyof EventMap]?: Set<Listener<EventMap[K]>> } = {};

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${String(event)}" threw:`, err);
      }
    });
  }

  clear(): void {
    this.listeners = {};
  }
}
