import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnsupportedAttachmentError } from "../lib/imageCompression";

const { uploadAttachment } = vi.hoisted(() => ({ uploadAttachment: vi.fn() }));
vi.mock("../components/AttachmentManager", () => ({ uploadAttachment }));

const { compressImage } = vi.hoisted(() => ({ compressImage: vi.fn() }));
vi.mock("../lib/imageCompression", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/imageCompression")>();
  return { ...actual, compressImage };
});

const { attachReceiptImageToTransactions } = await import("../components/ReceiptReview");

function makeFile(bytes: number, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], "receipt.jpg", { type });
}

describe("attachReceiptImageToTransactions", () => {
  beforeEach(() => {
    compressImage.mockReset();
    uploadAttachment.mockReset();
  });

  it("uploads the compressed image to every created transaction", async () => {
    const compressed = makeFile(1024);
    compressImage.mockResolvedValueOnce(compressed);
    uploadAttachment.mockResolvedValue({ ok: true } as Response);

    const result = await attachReceiptImageToTransactions(makeFile(4_000_000), [
      { id: "tx1" },
      { id: "tx2" }
    ]);

    expect(result).toBe(true);
    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(uploadAttachment).toHaveBeenCalledWith("tx1", compressed);
    expect(uploadAttachment).toHaveBeenCalledWith("tx2", compressed);
  });

  it("returns false without uploading when the image type is unsupported", async () => {
    compressImage.mockRejectedValueOnce(new UnsupportedAttachmentError("receipt.heic"));

    const result = await attachReceiptImageToTransactions(makeFile(1024), [{ id: "tx1" }]);

    expect(result).toBe(false);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("returns false without uploading when the compressed image is still too large", async () => {
    compressImage.mockResolvedValueOnce(makeFile(6 * 1024 * 1024));

    const result = await attachReceiptImageToTransactions(makeFile(6 * 1024 * 1024), [
      { id: "tx1" }
    ]);

    expect(result).toBe(false);
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it("returns false when every upload fails", async () => {
    compressImage.mockResolvedValueOnce(makeFile(1024));
    uploadAttachment.mockResolvedValue({ ok: false } as Response);

    const result = await attachReceiptImageToTransactions(makeFile(1024), [{ id: "tx1" }]);

    expect(result).toBe(false);
  });

  it("returns true when at least one of several transactions received the attachment", async () => {
    compressImage.mockResolvedValueOnce(makeFile(1024));
    uploadAttachment
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce({ ok: true } as Response);

    const result = await attachReceiptImageToTransactions(makeFile(1024), [
      { id: "tx1" },
      { id: "tx2" }
    ]);

    expect(result).toBe(true);
  });
});
