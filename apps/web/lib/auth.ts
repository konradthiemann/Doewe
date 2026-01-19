import { getServerSession } from "next-auth/next";

import { authOptions } from "./authOptions";

export type SessionUser = {
  id: string;
  email: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (process.env.TEST_USER_ID_BYPASS) {
    return {
      id: process.env.TEST_USER_ID_BYPASS,
      email: process.env.TEST_USER_EMAIL_BYPASS ?? null
    };
  }

  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  return { id, email: session.user?.email ?? null };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}
