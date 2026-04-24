import { vi } from 'vitest';

export function makeFakeLogger() {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
  };
  log.child = vi.fn(() => log);
  return log;
}

export const fakeLoggerModule = {
  logger: makeFakeLogger(),
  nextRequestId: () => 'test-req-id',
};
