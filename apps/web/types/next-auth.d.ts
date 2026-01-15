import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }

  interface User {
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
