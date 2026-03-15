# StreamPulse

A **real-time log streaming and monitoring tool** built with Node.js streams, TypeScript, and WebSockets. StreamPulse demonstrates advanced Node.js concepts: streams, backpressure, pipeline processing, and event-driven real-time systems.

## Features

- **Receive log streams** — Pipe any line-oriented log source (e.g. `tail -f`, process output) into StreamPulse
- **Process logs with Node streams** — Parser, filter, and broadcast stages form a single pipeline
- **Parse log entries** — Supports timestamp + level + message and JSON log formats
- **Filter by level** — Include or exclude `info`, `warn`, `error`, `debug` (dashboard toggles update the filter in real time)
- **Real-time broadcast** — All parsed logs are pushed to connected clients over WebSockets

### Dashboard (recruiter-friendly extras)

- **Live stats** — Total count, logs/sec rate, error count, and per-level breakdown (info/warn/error/debug)
- **Live indicator** — Pulsing “Live” badge when WebSocket is connected; “Reconnecting…” when disconnected
- **Search** — Filter displayed logs by text with highlight; **Ctrl+K** to focus search, **Esc** to clear
- **Pause / Resume** — Pause the view (logs keep buffering in memory); resume to flush and keep scrolling
- **Copy line** — Hover a log line and click the copy icon to copy that line to the clipboard
- **Relative timestamps** — “just now”, “5s ago”, “2m ago” with full ISO in tooltip
- **Clear view** — Clear the current view without disconnecting the stream
- **Sound on error** — Optional beep when a new ERROR log arrives (event-driven UX)

## Quick start

```bash
npm install
npm run build
tail -f app.log | node dist/cli.js
```

Then open **http://localhost:3080** for the dashboard. Or use the global CLI:

```bash
npm link
tail -f app.log | streampulse
```

## Example usage

```bash
# Stream a log file
tail -f app.log | streampulse

# Try with the included sample log (run in another terminal to append lines)
tail -f sample.log | node dist/cli.js

# Stream stdout of another process
npm run dev 2>&1 | streampulse

# Custom port
PORT=4000 tail -f app.log | streampulse
```

## Architecture

### High-level flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌────────────────────┐
│  Log source     │     │  Parser stream   │     │  Filter stream  │     │  Broadcast stream  │
│  (stdin / tail) │────▶│  (line → entry)  │────▶│  (by level)     │────▶│  (WebSocket send)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └────────────────────┘
        │                         │                         │                         │
        │                         │                         │                         ▼
        │                         │                         │                 ┌───────────────┐
        │                         │                         │                 │  Dashboard    │
        │                         │                         │                 │  (browser)    │
        │                         │                         │                 └───────────────┘
        ▼                         ▼                         ▼
   Backpressure propagates backward: if the broadcast (or any stage) is slow,
   the pipeline buffers and eventually pauses the source (e.g. tail).
```

### Directory layout

```
src/
├── index.ts           # HTTP server, static files, API, WS attach
├── cli.ts             # CLI entry: stdin → pipeline
├── types.ts           # LogLevel, LogEntry, FilterOptions
├── parsers/
│   ├── log-parser.ts  # Transform: raw chunks → LogEntry (line + level + timestamp)
│   └── index.ts
├── streams/
│   ├── line-splitter.ts  # Optional; parser also splits lines
│   ├── level-filter.ts   # Transform: filter LogEntry by level
│   └── index.ts
├── websocket/
│   ├── broadcast-stream.ts  # Writable: each chunk → send to all WS clients
│   ├── server.ts            # Attach WS server to HTTP, register clients with broadcast
│   └── index.ts
├── pipeline/
│   ├── create-pipeline.ts   # parser → filter → broadcast; returns input + setLevels()
│   └── index.ts
public/
├── index.html
├── style.css
└── app.js              # WS client, log list, level filter checkboxes → POST /api/levels
```

### Example log pipeline (code)

The pipeline is assembled in `createLogPipeline()`:

```ts
// pipeline/create-pipeline.ts
const parser = new LogParserStream();
const filter = new LevelFilterStream({ levels: options.levels, include: true });
parser.pipe(filter).pipe(broadcast);
// Source (e.g. process.stdin) is piped into parser by the CLI.
```

Data flow:

1. **Source** — `process.stdin` (when using `tail -f app.log | streampulse`) is a Node.js Readable stream of bytes.
2. **Parser** — `LogParserStream` is a Transform: reads raw chunks, splits by newline, parses each line into a `LogEntry` (level, message, timestamp, raw).
3. **Filter** — `LevelFilterStream` is a Transform: passes only entries whose level is in the current allow-list (updated via dashboard → `POST /api/levels` → `pipeline.setLevels()`).
4. **Broadcast** — `BroadcastStream` is a Writable: each `LogEntry` is JSON-serialized and sent to every connected WebSocket client.

Backpressure: if the broadcast (or any downstream) is slow, Node’s `.pipe()` backpressure propagates backward, so the source is not read until the pipeline is ready. No need to manually pause/resume.

## Node.js streams in short

- **Readable** — Produces data (e.g. `process.stdin`, `fs.createReadStream`). Consumers call `.pipe(writable)` or listen to `'data'`.
- **Writable** — Consumes data (e.g. `process.stdout`, our `BroadcastStream`). Implements `_write(chunk, encoding, callback)`.
- **Transform** — Both readable and writable; typically reads chunks, does work, and pushes transformed chunks (e.g. `LogParserStream`, `LevelFilterStream`). Used for parsing and filtering.
- **Pipeline** — Chaining with `.pipe()` connects streams so data flows in one direction and backpressure propagates automatically. `stream.pipeline()` (or `promisify` of it) is the preferred way to wire multiple streams and handle errors in one place; here we use `.pipe()` for simplicity.

StreamPulse uses object-mode streams for parsed data (streams of `LogEntry` objects) after the parser; the source side remains byte-oriented.

## Scripts

| Command        | Description                    |
|----------------|--------------------------------|
| `npm run build`| Compile TypeScript to `dist/`  |
| `npm start`    | Run server (no stdin piping)   |
| `npm run dev`  | Run with `tsx watch`           |
| `npm run cli`  | Run CLI (after build)          |
| `npm run dev:cli` | Run CLI with tsx (e.g. for testing) |

## License

MIT
