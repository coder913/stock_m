export interface ShutdownDependencies {
  closeServer(): Promise<void>;
  stopPublisher(): Promise<void>;
  closeQueue(): Promise<void>;
  closeRedis(): Promise<void>;
  closeDatabase(): Promise<void>;
}

export function createGracefulShutdown(dependencies: ShutdownDependencies, options: { timeoutMs: number; onTimeout(): void } = { timeoutMs: 20_000, onTimeout: () => process.exit(1) }): () => Promise<void> {
  let active: Promise<void> | undefined;
  return () => {
    if (active) return active;
    active = (async () => {
      const timer = setTimeout(options.onTimeout, options.timeoutMs);
      timer.unref?.();
      try {
        const drainRequests = dependencies.closeServer();
        await dependencies.stopPublisher();
        await drainRequests;
        await dependencies.closeQueue();
        await dependencies.closeRedis();
        await dependencies.closeDatabase();
      } finally { clearTimeout(timer); }
    })();
    return active;
  };
}
