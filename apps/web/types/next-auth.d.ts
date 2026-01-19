import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user?: DefaultSession["user"] & {
      id: string;
    };
  }

  interface User extends DefaultUser {
    id: string;
    email: string;
    password?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
