/** Google sign-in is offered only when the server has a Google OAuth client (DIG-94). */
export function googleEnabled(): boolean {
  return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
}
