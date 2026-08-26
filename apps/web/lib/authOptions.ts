import { compare } from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";

import { env } from "../env";

import { prisma } from "./prisma";
import { createUserWithDefaults } from "./userProvisioning";

import type { NextAuthOptions } from "next-auth";

// Railway may provide NUXTAUTH_URL / NUXTAUTH_SECRET instead of the canonical names.
// Copy them into the expected env vars so NextAuth picks them up automatically.
const rawNextAuthUrl = env.NEXTAUTH_URL ?? env.NUXTAUTH_URL;
if (rawNextAuthUrl && !env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = rawNextAuthUrl.startsWith("http")
    ? rawNextAuthUrl
    : `https://${rawNextAuthUrl}`;
}

if (!env.NEXTAUTH_SECRET && env.NUXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = env.NUXTAUTH_SECRET;
}

// Google OAuth is optional: only enabled when both credentials are present.
// We deliberately do NOT use the PrismaAdapter — the app's `Account` model is a
// domain entity (a financial account), not the NextAuth OAuth-account table, and
// sessions are JWT-based. User persistence for Google sign-in is handled manually
// in the `signIn` callback below (find-or-create + default account/categories).
const googleEnabled = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    name: "Credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;

      const user = await prisma.user.findUnique({ where: { email: credentials.email } });
      if (!user || !user.password) return null;

      const ok = await compare(credentials.password, user.password);
      if (!ok) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        passwordChangedAt: user.passwordChangedAt
      } as { id: string; email: string; name?: string; passwordChangedAt: Date | null };
    }
  })
];

if (googleEnabled) {
  providers.push(
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID as string,
      clientSecret: env.GOOGLE_CLIENT_SECRET as string,
      allowDangerousEmailAccountLinking: true
    })
  );
}

export const authOptions: NextAuthOptions = {
  // NEXTAUTH_SECRET is required in production; AUTH_SECRET keeps NextAuth v5 compatibility
  secret: env.NEXTAUTH_SECRET ?? env.NUXTAUTH_SECRET ?? env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      let userId: string;

      if (account?.provider === "google") {
        const email = user.email ?? profile?.email;
        if (!email) return false;

        // Find or provision the local user, then hand the DB id + password stamp
        // back on the `user` object so the jwt callback below stamps the token.
        let dbUser = await prisma.user.findUnique({
          where: { email },
          select: { id: true, passwordChangedAt: true }
        });
        if (!dbUser) {
          const created = await createUserWithDefaults({
            email,
            name: (profile?.name ?? user.name) || null,
            password: null
          });
          dbUser = { id: created.id, passwordChangedAt: created.passwordChangedAt };
        }

        user.id = dbUser.id;
        (user as { passwordChangedAt?: Date | null }).passwordChangedAt = dbUser.passwordChangedAt;
        userId = dbUser.id;
      } else {
        // Credentials sign-in already resolved the DB user in `authorize`.
        userId = user.id;
      }

      // Login tracking for the control-plane admin dashboard (usage/MAU
      // metrics): one LoginEvent row per successful sign-in, capturing the
      // household membership at that moment. Best-effort — a logging failure
      // must never block a legitimate sign-in.
      try {
        const membership = await prisma.householdMember.findUnique({
          where: { userId },
          select: { householdId: true }
        });
        if (membership) {
          await prisma.loginEvent.create({
            data: { userId, householdId: membership.householdId }
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- best-effort telemetry, must not throw
        console.error("Failed to record LoginEvent", error);
      }

      return true;
    },
    async jwt({ token, user }) {
      // Sign-in: stamp the token with the user's current passwordChangedAt.
      if (user) {
        token.userId = (user as { id?: string }).id;
        const changedAt = (user as { passwordChangedAt?: Date | null }).passwordChangedAt;
        token.pwdStamp = changedAt ? new Date(changedAt).getTime() : 0;
        return token;
      }

      // Subsequent requests: reject the token if the password changed after it
      // was issued (a reset/change evicts previously-issued sessions), or if
      // the control-plane admin dashboard has suspended/deleted the account
      // since the token was issued — same mechanism, no re-login required.
      if (token.userId) {
        const current = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { passwordChangedAt: true, suspendedAt: true, deletedAt: true }
        });
        if (!current) return {};
        if (current.suspendedAt || current.deletedAt) {
          return {}; // suspended/deleted → no userId → getSessionUser() returns null (401)
        }
        const dbStamp = current.passwordChangedAt ? current.passwordChangedAt.getTime() : 0;
        if (dbStamp > ((token.pwdStamp as number | undefined) ?? 0)) {
          return {}; // stale token → no userId → getSessionUser() returns null (401)
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    }
  }
};
