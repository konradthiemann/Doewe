import { withAuth } from "next-auth/middleware";

const rawNextAuthUrl = process.env.NEXTAUTH_URL || process.env.NUXTAUTH_URL;
if (rawNextAuthUrl && !process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = rawNextAuthUrl.startsWith("http")
    ? rawNextAuthUrl
    : `https://${rawNextAuthUrl}`;
}

if (!process.env.NEXTAUTH_SECRET && process.env.NUXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = process.env.NUXTAUTH_SECRET;
}

export default withAuth({
  pages: {
    signIn: "/login"
  }
});

export const config = {
  // ~offline: Offline-Fallback-Seite muss ohne Session erreichbar sein,
  // damit der Service Worker sie beim Install precachen kann.
  // api/cron: Cron-Endpoints authentifizieren per Secret-Header, nicht per Session.
  matcher: ["/((?!api/auth|api/cron|api/demo|api/health|login|forgot-password|reset-password|~offline|impressum|datenschutz|_next|static|favicon.ico|assets|.*\\..*).*)"]
};
