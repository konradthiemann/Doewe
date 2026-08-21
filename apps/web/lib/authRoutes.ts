/**
 * Routes shown to signed-out users. These render without the app chrome
 * (sidebar / bottom nav / top bar) and without the nav-offset padding.
 * Single source of truth so AppChrome and the layout container cannot drift.
 */
export const AUTH_ROUTES = ["/login", "/forgot-password", "/reset-password", "/welcome"] as const;

export function isAuthRoute(pathname: string | null | undefined): boolean {
  return !!pathname && (AUTH_ROUTES as readonly string[]).includes(pathname);
}
