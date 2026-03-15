/**
 * Log levels supported by StreamPulse.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Parsed log entry emitted by the parser stream.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  raw: string;
  /** Optional metadata (e.g. from JSON logs) */
  meta?: Record<string, unknown>;
}

/**
 * Filter options for the filter stream.
 */
export interface FilterOptions {
  levels?: LogLevel[];
  /** If true, only entries matching levels are passed; if false, matching entries are excluded */
  include?: boolean;
}
