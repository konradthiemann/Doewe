import { createTransaction, parseCents } from "@doewe/shared";
import { NextResponse } from "next/server";

type StoredTx = ReturnType<typeof createTransaction>;

// In-memory store for demo purposes (per server process)
const store: StoredTx[] = [];

export async function GET() {
  return NextResponse.json({ data: store });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    const tx = createTransaction({
      id: String(body.id ?? `tx_${Date.now()}`),
      accountId: String(body.accountId ?? "acc_demo"),
      amountCents: body.amount != null ? parseCents(String(body.amount)) : parseCents("0"),
      description: String(body.description ?? ""),
      occurredAt: body.occurredAt ?? new Date().toISOString(),
      categoryId: body.categoryId ? String(body.categoryId) : undefined
    });
    store.push(tx);
    return NextResponse.json({ data: tx }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
