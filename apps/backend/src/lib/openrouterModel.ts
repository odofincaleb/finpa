const DEFAULT_FREE_MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * OpenRouter model is backend-env-only and must be a free-tier (`:free`) model.
 * Non-free configured models are rejected and replaced with the default free model.
 */
export function resolveOpenRouterModel(): string {
  const configured = (process.env.OPENROUTER_MODEL || DEFAULT_FREE_MODEL).trim();
  if (!configured.toLowerCase().endsWith(":free")) {
    console.warn(
      `[finpa] OPENROUTER_MODEL must end with :free (got "${configured}"); using ${DEFAULT_FREE_MODEL}`,
    );
    return DEFAULT_FREE_MODEL;
  }
  return configured;
}

export { DEFAULT_FREE_MODEL };
