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
  matcher: ["/((?!api/auth|api/health|login|_next|static|favicon.ico|assets|.*\\..*).*)"]
};
