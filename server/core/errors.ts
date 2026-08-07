export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 500, public readonly retryable = false) {
    super(message);
  }
}

export class ProviderError extends Error {
  constructor(public readonly source: "alpaca" | "sec" | "finnhub" | "fred", message: string) { super(message); }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(source: ProviderError["source"], public readonly retryAfter: string) { super(source, "数据源请求超限"); }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(source: ProviderError["source"]) { super(source, "数据源请求超时"); }
}
