import { compare, hash } from "bcryptjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createResetToken, hashResetToken } from "../lib/passwordReset";

// change-password relies on getSessionUser(), which honours TEST_USER_ID_BYPASS.
const TEST_USER_ID = "test-user-pw";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

const ORIGINAL_PASSWORD = "origpass1";
const TEST_EMAIL = "pw-test@example.com";

let prisma: import("@prisma/client").PrismaClient;

async function seedPassword() {
  await prisma.user.update({
    where: { id: TEST_USER_ID },
    data: { password: await hash(ORIGINAL_PASSWORD, 10), passwordChangedAt: null },
  });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();
  await prisma.user.upsert({
    where: { email: TEST_EMAIL },
    update: { password: await hash(ORIGINAL_PASSWORD, 10) },
    create: { id: TEST_USER_ID, email: TEST_EMAIL, password: await hash(ORIGINAL_PASSWORD, 10) },
  });
  await prisma.passwordResetToken.deleteMany({ where: { userId: TEST_USER_ID } });
});

afterAll(async () => {
  if (prisma) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  }
});

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/change-password", () => {
  beforeEach(seedPassword);

  it("rejects a wrong current password", async () => {
    const { POST } = await import("../app/api/auth/change-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/change-password", {
      currentPassword: "not-the-password",
      newPassword: "brandnew123",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_CURRENT_PASSWORD");
  });

  it("rejects reusing the same password", async () => {
    const { POST } = await import("../app/api/auth/change-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/change-password", {
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: ORIGINAL_PASSWORD,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("SAME_PASSWORD");
  });

  it("rejects a too-short new password", async () => {
    const { POST } = await import("../app/api/auth/change-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/change-password", {
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: "short",
    }));
    expect(res.status).toBe(400);
  });

  it("changes the password with a correct current password", async () => {
    const { POST } = await import("../app/api/auth/change-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/change-password", {
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: "brandnew123",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(await compare("brandnew123", user!.password)).toBe(true);
    expect(await compare(ORIGINAL_PASSWORD, user!.password)).toBe(false);
    // passwordChangedAt is stamped so existing JWT sessions are evicted.
    expect(user!.passwordChangedAt).not.toBeNull();
  });
});

describe("POST /api/auth/forgot-password", () => {
  beforeEach(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  it("returns 200 and creates a token for a known email", async () => {
    const { POST } = await import("../app/api/auth/forgot-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/forgot-password", { email: TEST_EMAIL }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const count = await prisma.passwordResetToken.count({ where: { userId: TEST_USER_ID } });
    expect(count).toBe(1);
  });

  it("returns 200 but creates no token for an unknown email", async () => {
    const { POST } = await import("../app/api/auth/forgot-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/forgot-password", {
      email: "nobody-here@example.com",
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const count = await prisma.passwordResetToken.count({ where: { userId: TEST_USER_ID } });
    expect(count).toBe(0);
  });

  it("invalidates previous tokens when requested again", async () => {
    const { POST } = await import("../app/api/auth/forgot-password/route");
    await POST(jsonRequest("http://localhost/api/auth/forgot-password", { email: TEST_EMAIL }));
    await POST(jsonRequest("http://localhost/api/auth/forgot-password", { email: TEST_EMAIL }));

    const count = await prisma.passwordResetToken.count({ where: { userId: TEST_USER_ID } });
    expect(count).toBe(1);
  });
});

describe("reset-password", () => {
  beforeEach(async () => {
    await prisma.passwordResetToken.deleteMany({ where: { userId: TEST_USER_ID } });
    await seedPassword();
  });

  async function issueToken(overrides?: { expiresAt?: Date; usedAt?: Date }) {
    const { token, tokenHash } = createResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: TEST_USER_ID,
        tokenHash,
        expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
        usedAt: overrides?.usedAt ?? null,
      },
    });
    return token;
  }

  it("GET reports a valid token as valid", async () => {
    const token = await issueToken();
    const { GET } = await import("../app/api/auth/reset-password/route");
    const res = await GET(new Request(`http://localhost/api/auth/reset-password?token=${encodeURIComponent(token)}`));
    expect((await res.json()).valid).toBe(true);
  });

  it("GET reports an expired token as invalid", async () => {
    const token = await issueToken({ expiresAt: new Date(Date.now() - 1000) });
    const { GET } = await import("../app/api/auth/reset-password/route");
    const res = await GET(new Request(`http://localhost/api/auth/reset-password?token=${encodeURIComponent(token)}`));
    expect((await res.json()).valid).toBe(false);
  });

  it("resets the password with a valid token and consumes it", async () => {
    const token = await issueToken();
    const { POST } = await import("../app/api/auth/reset-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/reset-password", {
      token,
      newPassword: "resetpass123",
    }));
    expect(res.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: TEST_USER_ID } });
    expect(await compare("resetpass123", user!.password)).toBe(true);
    // passwordChangedAt is stamped so existing JWT sessions are evicted.
    expect(user!.passwordChangedAt).not.toBeNull();

    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashResetToken(token) } });
    expect(record?.usedAt).not.toBeNull();
  });

  it("rejects reusing a consumed token", async () => {
    const token = await issueToken();
    const { POST } = await import("../app/api/auth/reset-password/route");
    await POST(jsonRequest("http://localhost/api/auth/reset-password", { token, newPassword: "resetpass123" }));

    const res = await POST(jsonRequest("http://localhost/api/auth/reset-password", {
      token,
      newPassword: "anotherpass123",
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_OR_EXPIRED_TOKEN");
  });

  it("rejects an expired token", async () => {
    const token = await issueToken({ expiresAt: new Date(Date.now() - 1000) });
    const { POST } = await import("../app/api/auth/reset-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/reset-password", {
      token,
      newPassword: "resetpass123",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    const { POST } = await import("../app/api/auth/reset-password/route");
    const res = await POST(jsonRequest("http://localhost/api/auth/reset-password", {
      token: "totally-made-up-token",
      newPassword: "resetpass123",
    }));
    expect(res.status).toBe(400);
  });
});
