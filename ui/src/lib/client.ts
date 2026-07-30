// Typed WebSocket client for the bridge. Framework-free.
//
// Requests carry an id so replies can be correlated; `request()` resolves with
// the terminal event for that id. Non-terminal traffic (progress, structural
// change notifications, reload) goes to subscribers instead.

import { WS_PATH } from '../../../protocol/index.js';

export type BridgeEvent = BSV.Event;
type Listener = (event: BridgeEvent) => void;

/** The event that completes each request type. */
const TERMINAL = {
  snapshot: 'snapshot',
  apply: 'applied',
  palette: 'palette',
  ping: 'pong',
} as const satisfies Partial<Record<BSV.RequestType, BSV.EventType>>;

type Awaitable = keyof typeof TERMINAL;

/** Requests that produce a terminal reply, i.e. everything `request()` accepts. */
type AwaitableRequest = Extract<BSV.Request, { type: Awaitable }>;

interface Waiter {
  expect: BSV.EventType;
  resolve: (e: BridgeEvent) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type ConnectionState = 'connecting' | 'open' | 'closed';

export class BridgeClient {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly waiters = new Map<number, Waiter>();
  private readonly listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private closedByUs = false;

  state: ConnectionState = 'connecting';
  lomReady = false;

  constructor(private readonly url = `ws://${location.host}${WS_PATH}`) {}

  connect(): void {
    this.closedByUs = false;
    this.setState('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => this.setState('open');

    ws.onclose = () => {
      this.lomReady = false;
      this.setState('closed');
      this.failAll('socket closed');
      if (!this.closedByUs) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 1000);
      }
    };

    // A socket error is always followed by close; reconnect is handled there.
    ws.onerror = () => {};

    ws.onmessage = (ev) => {
      let event: BridgeEvent;
      try {
        event = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (event.type === 'status') this.lomReady = event.lomReady;

      const id = 'id' in event ? event.id : undefined;
      if (id !== undefined) {
        const waiter = this.waiters.get(id);
        if (waiter && (event.type === waiter.expect || event.type === 'error')) {
          this.waiters.delete(id);
          clearTimeout(waiter.timer);
          if (event.type === 'error') waiter.reject(new Error(event.message));
          else waiter.resolve(event);
        }
      }
      this.emit(event);
    };
  }

  close(): void {
    this.closedByUs = true;
    clearTimeout(this.reconnectTimer);
    this.failAll('client closed');
    this.ws?.close();
    this.ws = null;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Fire and forget. */
  send(request: BSV.Request): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(request));
  }

  /** Send and await the terminal event for this request. */
  request<R extends AwaitableRequest>(
    request: R,
    timeoutMs = 120_000,
  ): Promise<BSV.EventOf<(typeof TERMINAL)[R['type']]>> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const id = this.nextId++;
    const expect: BSV.EventType = TERMINAL[request.type];
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`${request.type} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.set(id, { expect, resolve: resolve as Waiter['resolve'], reject, timer });
      this.ws!.send(JSON.stringify({ ...request, id }));
    });
  }

  private emit(event: BridgeEvent): void {
    for (const fn of this.listeners) fn(event);
  }

  private setState(s: ConnectionState): void {
    this.state = s;
    this.emit({ type: 'status', lomReady: this.lomReady });
  }

  private failAll(reason: string): void {
    for (const [, w] of this.waiters) {
      clearTimeout(w.timer);
      w.reject(new Error(reason));
    }
    this.waiters.clear();
  }
}
