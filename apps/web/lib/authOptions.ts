import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { prisma } from "./prisma";

const rawNextAuthUrl = process.env.NEXTAUTH_URL || process.env.NUXTAUTH_URL;
if (rawNextAuthUrl && !process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = rawNextAuthUrl.startsWith("http")
    ? rawNextAuthUrl
    : `https://${rawNextAuthUrl}`;
}

if (!process.env.NEXTAUTH_SECRET && process.env.NUXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = process.env.NUXTAUTH_SECRET;
}

export const authOptions: NextAuthOptions = {
  // NEXTAUTH_SECRET is required in production; AUTH_SECRET keeps NextAuth v5 compatibility
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
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

        return { id: user.id, email: user.email, name: user.name ?? undefined };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as { id?: string }).id;
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
