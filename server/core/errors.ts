export class ApiError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 500, public readonly retryable = false) {
    super(message);
  }
}
