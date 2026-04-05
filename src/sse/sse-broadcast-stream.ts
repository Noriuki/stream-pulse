import { Writable } from 'node:stream';
import type { ServerResponse } from 'node:http';
import type { LogEntry } from '../types.js';

/**
 * Writable stream that broadcasts each log entry to all open SSE responses.
 * Broken or back-pressured clients are dropped so the Node stream pipeline does not stall indefinitely.
 */
export class SseBroadcastStream extends Writable {
  private clients = new Set<ServerResponse>();

  constructor(options?: ConstructorParameters<typeof Writable>[0]) {
    super({
      ...options,
      objectMode: true,
    });
  }

  addClient(res: ServerResponse): void {
    this.clients.add(res);
  }

  removeClient(res: ServerResponse): void {
    this.clients.delete(res);
  }

  getClientCount(): number {
    return this.clients.size;
  }

  _write(
    chunk: LogEntry,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const line = `data: ${JSON.stringify(chunk)}\n\n`;
    const evict: ServerResponse[] = [];

    for (const res of this.clients) {
      if (res.writableEnded || res.destroyed) {
        evict.push(res);
        continue;
      }
      try {
        const ok = res.write(line);
        if (!ok) {
          // Client buffer full — evict so upstream backpressure does not block all consumers forever.
          evict.push(res);
        }
      } catch {
        evict.push(res);
      }
    }

    for (const res of evict) {
      this.removeClient(res);
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
    }

    callback();
  }
}
