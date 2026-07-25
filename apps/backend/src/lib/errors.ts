export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "SUBSCRIPTION_REQUIRED"
  | "RATE_LIMIT"
  | "UPSTREAM_TIMEOUT"
  | "PARSE_FAILED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "PIN_INVALID"
  | "PIN_REDEEMED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
