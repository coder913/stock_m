export interface ServerReadiness {
  ready: boolean;
  services: { postgres: "ready" | "unavailable"; redis: "ready" | "degraded" | "unavailable" };
  migrationVersion: string;
}

export async function loadServerReadiness(fetcher: typeof fetch = fetch): Promise<ServerReadiness> {
  const response = await fetcher("/api/health/ready", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`服务端就绪检查失败 (${response.status})`);
  return response.json() as Promise<ServerReadiness>;
}
