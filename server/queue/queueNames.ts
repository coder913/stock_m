export const queueNames = {
  monitorRuns: "monitor-runs",
  notifications: "notifications",
} as const;

export type QueueName = typeof queueNames[keyof typeof queueNames];
