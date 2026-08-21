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
  | "INVALID_PLAN"
  | "PAYSTACK_NOT_CONFIGURED"
  | "PAYSTACK_INIT_FAILED"
  | "PAYSTACK_VERIFY_FAILED"
  | "PAYMENT_NOT_SUCCESSFUL"
  | "PAYMENT_REFERENCE_MISMATCH"
  | "PAYMENT_PRODUCT_MISMATCH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYSTACK_SIGNATURE_INVALID"
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
