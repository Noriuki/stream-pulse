import { Transform } from 'node:stream';

/**
 * Transform stream that splits incoming data into lines.
 * Handles backpressure: only pushes when consumer is ready.
 */
export class LineSplitterStream extends Transform {
  private buffer = '';

  constructor(options?: ConstructorParameters<typeof Transform>[0]) {
    super({
      ...options,
      objectMode: true,
      decodeStrings: true,
    });
  }

  _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    const text = (this.buffer + (typeof chunk === 'string' ? chunk : chunk.toString())).replace(/\r\n/g, '\n');
    this.buffer = '';
    const lines = text.split('\n');
    const last = lines.pop();
    if (last !== undefined && last !== '') {
      this.buffer = last + '\n';
    }
    for (const line of lines) {
      this.push(line);
    }
    callback();
  }

  _flush(callback: (error?: Error | null) => void): void {
    if (this.buffer.trim()) {
      this.push(this.buffer.trim());
    }
    callback();
  }
}
