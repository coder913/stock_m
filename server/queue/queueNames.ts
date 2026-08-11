export const queueNames = {
  monitorRuns: "monitor-runs",
  notifications: "notifications",
  tradingCommands: "trading-commands",
} as const;

export type QueueName = typeof queueNames[keyof typeof queueNames];
