export function safeNotificationPath(candidate: unknown): string {
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  return candidate;
}
