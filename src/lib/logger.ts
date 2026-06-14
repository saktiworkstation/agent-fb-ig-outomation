import { logEmitter } from './logBroadcaster';

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' | 'DEBUG';

function timestamp(): string {
  return new Date().toISOString();
}

function serializeData(data: unknown): string {
  if (data instanceof Error) {
    const obj: Record<string, unknown> = { message: data.message };
    for (const key of Object.keys(data)) {
      obj[key] = (data as unknown as Record<string, unknown>)[key];
    }
    return JSON.stringify(obj);
  }
  return typeof data === 'object' ? JSON.stringify(data) : String(data);
}

function log(level: LogLevel, module: string, message: string, data?: unknown): void {
  const prefix = `[${timestamp()}] [${level.padEnd(7)}] [${module}]`;
  const suffix = data !== undefined ? ` ${serializeData(data)}` : '';
  const line = `${prefix} ${message}${suffix}`;
  console.log(line);
  logEmitter.emit('log', line);
}

export function createLogger(module: string) {
  return {
    info: (msg: string, data?: unknown) => log('INFO', module, msg, data),
    warn: (msg: string, data?: unknown) => log('WARN', module, msg, data),
    error: (msg: string, data?: unknown) => log('ERROR', module, msg, data),
    success: (msg: string, data?: unknown) => log('SUCCESS', module, msg, data),
    debug: (msg: string, data?: unknown) => log('DEBUG', module, msg, data),
  };
}
