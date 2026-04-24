import pino from 'pino';
import { config } from './config.js';

const usePretty =
  process.env.LOG_PRETTY === '1' ||
  (process.env.LOG_PRETTY !== '0' && process.stdout.isTTY);

export const logger = pino({
  level: process.env.LOG_LEVEL || config.logLevel || 'info',
  base: { svc: 'ratmusic' },
  transport: usePretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,svc',
          singleLine: false,
        },
      }
    : undefined,
});

let __reqCounter = 0;
export function nextRequestId() {
  __reqCounter = (__reqCounter + 1) & 0xfffff;
  return `${Date.now().toString(36)}-${__reqCounter.toString(36)}`;
}
