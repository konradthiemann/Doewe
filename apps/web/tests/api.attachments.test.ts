import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integrationstests für die Beleg-Endpoints:
//   GET/POST /api/transactions/[id]/attachments
//   GET/DELETE /api/attachments/[id]
// pretest hat Schema + Seed bereits gepusht; echte Postgres nötig.

const TEST_USER_ID = "test-user-attach";
process.env.TEST_USER_ID_BYPASS = TEST_USER_ID;

let prisma: import("@prisma/client").PrismaClient;
let testUserId: string;
let testAccountId: string;
let testTransactionId: string;
let otherUserId: string;
let otherTransactionId: string;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function makeUploadRequest(transactionId: string, file: File): Request {
  const form = new FormData();
  form.append("file", file);
  return new Request(`http://localhost/api/transactions/${transactionId}/attachments`, {
    method: "POST",
    body: form
  });
}

beforeAll(async () => {
  const { PrismaClient } = await import("@prisma/client");
  prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: "attach-test@example.com" },
    update: {},
    create: { id: TEST_USER_ID, email: "attach-test@example.com", password: "hashed" }
  });
  testUserId = user.id;

  const account = await prisma.account.upsert({
    where: { id: "acc_attach_test" },
    update: { userId: user.id },
    create: { id: "acc_attach_test", name: "Attach Test Account", userId: user.id }
  });
  testAccountId = account.id;

  await prisma.transaction.deleteMany({ where: { accountId: testAccountId } });
  const tx = await prisma.transaction.create({
    data: {
      accountId: testAccountId,
      amountCents: -5000,
      description: "Attach test tx",
      occurredAt: new Date(),
      taxRelevant: true
    }
  });
  testTransactionId = tx.id;

  // Fremder Nutzer für Ownership-Tests
  const otherUser = await prisma.user.upsert({
    where: { email: "attach-other@example.com" },
    update: {},
    create: { id: "test-user-attach-other", email: "attach-other@example.com", password: "hashed" }
  });
  otherUserId = otherUser.id;
  const otherAccount = await prisma.account.upsert({
    where: { id: "acc_attach_other" },
    update: { userId: otherUser.id },
    create: { id: "acc_attach_other", name: "Other Account", userId: otherUser.id }
  });
  const otherTx = await prisma.transaction.create({
    data: {
      accountId: otherAccount.id,
      amountCents: -100,
      description: "Foreign tx",
      occurredAt: new Date()
    }
  });
  otherTransactionId = otherTx.id;
});

afterAll(async () => {
  if (prisma) {
    await prisma.transaction.deleteMany({ where: { account: { userId: { in: [testUserId, otherUserId] } } } });
    await prisma.account.deleteMany({ where: { userId: { in: [testUserId, otherUserId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [testUserId, otherUserId] } } });
    await prisma.$disconnect();
  }
});

describe("/api/transactions/[id]/attachments + /api/attachments/[id]", () => {
  it("uploads, lists, downloads and deletes an attachment", async () => {
    const listRoutes = await import("../app/api/transactions/[id]/attachments/route");
    const detailRoutes = await import("../app/api/attachments/[id]/route");

    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const res = await listRoutes.POST(makeUploadRequest(testTransactionId, file), {
      params: { id: testTransactionId }
    });
    expect(res.status).toBe(201);
    const created: { id: string; fileName: string; mimeType: string; sizeBytes: number; data?: unknown } =
      await res.json();
    expect(created.id).toBeTruthy();
    expect(created.fileName).toBe("receipt.png");
    expect(created.mimeType).toBe("image/png");
    expect(created.sizeBytes).toBe(PNG_BYTES.byteLength);
    expect(created.data).toBeUndefined();

    // Liste enthält nur Metadaten
    const listRes = await listRoutes.GET(
      new Request(`http://localhost/api/transactions/${testTransactionId}/attachments`),
      { params: { id: testTransactionId } }
    );
    expect(listRes.status).toBe(200);
    const list: Array<{ id: string; data?: unknown }> = await listRes.json();
    expect(list.some((a) => a.id === created.id)).toBe(true);
    expect(list.every((a) => a.data === undefined)).toBe(true);

    // Binary-Download: Bytes und Header stimmen
    const getRes = await detailRoutes.GET(new Request(`http://localhost/api/attachments/${created.id}`), {
      params: { id: created.id }
    });
    expect(getRes.status).toBe(200);
    expect(getRes.headers.get("Content-Type")).toBe("image/png");
    expect(getRes.headers.get("Cache-Control")).toContain("no-store");
    const downloaded = new Uint8Array(await getRes.arrayBuffer());
    expect(downloaded).toEqual(PNG_BYTES);

    // DELETE → 204, danach 404
    const deleteRes = await detailRoutes.DELETE(
      new Request(`http://localhost/api/attachments/${created.id}`, { method: "DELETE" }),
      { params: { id: created.id } }
    );
    expect(deleteRes.status).toBe(204);
    const getAfterDelete = await detailRoutes.GET(new Request(`http://localhost/api/attachments/${created.id}`), {
      params: { id: created.id }
    });
    expect(getAfterDelete.status).toBe(404);
  }, 20000);

  it("rejects bad uploads (type, size, limit, missing file)", async () => {
    const listRoutes = await import("../app/api/transactions/[id]/attachments/route");

    // Unerlaubter Typ → 415
    const badType = new File([PNG_BYTES], "notes.txt", { type: "text/plain" });
    const typeRes = await listRoutes.POST(makeUploadRequest(testTransactionId, badType), {
      params: { id: testTransactionId }
    });
    expect(typeRes.status).toBe(415);

    // Zu groß (>5 MB) → 413
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" });
    const sizeRes = await listRoutes.POST(makeUploadRequest(testTransactionId, big), {
      params: { id: testTransactionId }
    });
    expect(sizeRes.status).toBe(413);

    // Fehlende Datei → 400
    const emptyForm = new FormData();
    const missingRes = await listRoutes.POST(
      new Request(`http://localhost/api/transactions/${testTransactionId}/attachments`, {
        method: "POST",
        body: emptyForm
      }),
      { params: { id: testTransactionId } }
    );
    expect(missingRes.status).toBe(400);

    // Limit: 5 Uploads ok, der 6. → 400
    for (let i = 0; i < 5; i++) {
      const ok = await listRoutes.POST(
        makeUploadRequest(testTransactionId, new File([PNG_BYTES], `r${i}.png`, { type: "image/png" })),
        { params: { id: testTransactionId } }
      );
      expect(ok.status).toBe(201);
    }
    const overLimit = await listRoutes.POST(
      makeUploadRequest(testTransactionId, new File([PNG_BYTES], "r6.png", { type: "image/png" })),
      { params: { id: testTransactionId } }
    );
    expect(overLimit.status).toBe(400);

    await prisma.attachment.deleteMany({ where: { transactionId: testTransactionId } });
  }, 20000);

  it("enforces ownership (404 on foreign resources)", async () => {
    const listRoutes = await import("../app/api/transactions/[id]/attachments/route");
    const detailRoutes = await import("../app/api/attachments/[id]/route");

    // Upload auf fremde Transaktion → 404
    const file = new File([PNG_BYTES], "receipt.png", { type: "image/png" });
    const postRes = await listRoutes.POST(makeUploadRequest(otherTransactionId, file), {
      params: { id: otherTransactionId }
    });
    expect(postRes.status).toBe(404);

    // Fremdes Attachment direkt in der DB anlegen → GET/DELETE 404
    const foreign = await prisma.attachment.create({
      data: {
        transactionId: otherTransactionId,
        fileName: "foreign.png",
        mimeType: "image/png",
        sizeBytes: PNG_BYTES.byteLength,
        data: Buffer.from(PNG_BYTES)
      }
    });
    const getRes = await detailRoutes.GET(new Request(`http://localhost/api/attachments/${foreign.id}`), {
      params: { id: foreign.id }
    });
    expect(getRes.status).toBe(404);
    const deleteRes = await detailRoutes.DELETE(
      new Request(`http://localhost/api/attachments/${foreign.id}`, { method: "DELETE" }),
      { params: { id: foreign.id } }
    );
    expect(deleteRes.status).toBe(404);
    expect(await prisma.attachment.count({ where: { id: foreign.id } })).toBe(1);
  }, 20000);

  it("cascades attachment deletion when the transaction is deleted", async () => {
    const listRoutes = await import("../app/api/transactions/[id]/attachments/route");
    const txDetailRoutes = await import("../app/api/transactions/[id]/route");

    const tx = await prisma.transaction.create({
      data: {
        accountId: testAccountId,
        amountCents: -1000,
        description: "Cascade test",
        occurredAt: new Date(),
        taxRelevant: true
      }
    });
    const file = new File([PNG_BYTES], "cascade.png", { type: "image/png" });
    const uploadRes = await listRoutes.POST(makeUploadRequest(tx.id, file), { params: { id: tx.id } });
    expect(uploadRes.status).toBe(201);

    const deleteRes = await txDetailRoutes.DELETE(
      new Request(`http://localhost/api/transactions/${tx.id}`, { method: "DELETE" }),
      { params: { id: tx.id } }
    );
    expect(deleteRes.status).toBe(204);
    expect(await prisma.attachment.count({ where: { transactionId: tx.id } })).toBe(0);
  }, 20000);
});
