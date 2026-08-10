export interface ApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
  retryable?: boolean;
  requestId?: string;
  details?: unknown;
}

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly retryable: boolean,
    public readonly requestId?: string,
    public readonly details?: unknown,
  ) { super(message); }
}

export class ApiClient {
  constructor(private readonly baseUrl = "") {}

  async requestJson<T>(request: ApiRequest): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (request.body !== undefined) headers["content-type"] = "application/json";
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    const response = await fetch(`${this.baseUrl}${request.path}`, {
      method: request.method ?? "GET",
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: request.signal,
    });
    const hasJson = response.headers.get("content-type")?.includes("application/json");
    const payload = hasJson ? await response.json() : undefined;
    if (!response.ok) {
      const error = (payload ?? {}) as ApiErrorBody;
      throw new ApiClientError(error.code ?? "HTTP_ERROR", error.message ?? `Request failed (${response.status})`,
        response.status, error.retryable ?? response.status >= 500, error.requestId, error.details);
    }
    return payload as T;
  }
}
