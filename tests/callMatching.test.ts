import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

// 这组测试覆盖了号码规范化、签名校验、客户匹配和状态合并等关键规则。
import {
  buildCallRecord,
  hashPhoneNumber,
  matchClientForCall,
  normalizePhone,
  verifySignature,
} from "../src/callMatching.js";

describe("call matching rules", () => {
  // 号码标准化应将常见输入格式统一成 E.164 形式，便于后续哈希和比对。
  it("normalizes a U.S. number into E.164 format", () => {
    expect(normalizePhone("(210) 555-0177")).toBe("+12105550177");
    expect(normalizePhone("2105550178")).toBe("+12105550178");
  });

  it("hashes phone numbers consistently with client hashes", () => {
    const number = "+12105550177";
    const expected = crypto
      .createHash("sha256")
      .update("12105550177")
      .digest("hex");
    expect(hashPhoneNumber(number)).toBe(expected);
  });

  it("accepts a valid HMAC signature", () => {
    const secret = "take-home-secret";
    const body = '{"call_id":"7001","state":"ringing"}';
    const signature = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifySignature(body, signature, secret)).toBe(true);
  });

  it("matches the latest open case for a client", () => {
    const client = {
      client_id: "C-101",
      name: "Maria Lopez",
      phone_hashes: [hashPhoneNumber("+12105550178") ?? ""],
      cases: [
        {
          case_id: "CASE-1",
          status: "closed",
          opened_at: "2025-01-01",
          closed_at: "2025-05-01",
        },
        {
          case_id: "CASE-2",
          status: "open",
          opened_at: "2026-06-11",
          closed_at: null,
        },
        {
          case_id: "CASE-3",
          status: "open",
          opened_at: "2026-07-01",
          closed_at: null,
        },
      ],
    };

    expect(
      matchClientForCall(
        "+12105550178",
        [client],
        [{ number: "+14155550100", label: "Main line" }],
      ),
    ).toMatchObject({
      status: "matched",
      client_id: "C-101",
      case_id: "CASE-3",
    });
  });

  it("keeps the newest non-null values on a call record", () => {
    const first = buildCallRecord(
      {},
      { call_id: "7001", state: "ringing", direction: "inbound" },
    );
    const second = buildCallRecord(first, {
      call_id: "7001",
      state: "connected",
      date_ended: null,
    });
    const third = buildCallRecord(second, {
      call_id: "7001",
      state: "hangup",
      date_ended: 1234,
      duration: 10,
    });

    expect(third.state).toBe("hangup");
    expect(third.date_ended).toBe(1234);
    expect(third.duration).toBe(10);
  });
});
