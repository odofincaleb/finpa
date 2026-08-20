const DEFAULT_AUTH_REDIRECT_URL = "finpa://auth/callback";

export function getAuthRedirectUrl() {
  return (
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || DEFAULT_AUTH_REDIRECT_URL
  ).trim();
}
