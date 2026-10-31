import crypto from "node:crypto";

// ------------------------------------------------------------
// 1) 业务数据结构
// ------------------------------------------------------------
// ClientCase 表示：一个客户名下，某个案件的生命周期状态。
// 例如：是否 open/closed，以及开始/结束时间。
export interface ClientCase {
  case_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
}

// Client 表示：一个客户的核心资料。
// phone_hashes 中保存的是标准化号码的 SHA-256 哈希，避免直接暴露真实手机号。
export interface Client {
  client_id: string;
  name: string;
  phone_hashes: string[];
  cases: ClientCase[];
}

// CompanyLine 表示：公司内部号码，例如总机或 intake 号码。
export interface CompanyLine {
  number: string;
  label: string;
}

// MatchResult 表示：对一通电话的最终识别结果。
// - matched：命中客户并有最新 open case
// - customer_only：命中客户但没有 open case
// - internal：这条号码属于公司内部号码
// - needs_review：存在多客户命中，需要人工确认
// - unmatched：未找到任何客户
export interface MatchResult {
  status:
    | "matched"
    | "customer_only"
    | "internal"
    | "needs_review"
    | "unmatched";
  client_id: string | null;
  case_id: string | null;
  reason: string;
  client_name?: string;
  matched_clients?: string[];
}

// CallEvent 表示：电话系统上报的一次事件快照。
// 一条通话可能会产生多次事件（ringing / connected / hangup），最终会被合并成一条记录。
export interface CallEvent {
  call_id: string;
  direction?: string;
  state?: string;
  external_number?: string | null;
  internal_number?: string | null;
  date_started?: number | null;
  date_ended?: number | null;
  duration?: number | null;
  recording_url?: string | null;
  last_updated_at?: number | null;
}

// CallRecord 是最终落库/展示的呼叫记录。
// 它在 CallEvent 的基础上增加了 match 和 match_status 两个字段。
export interface CallRecord extends CallEvent {
  match?: MatchResult;
  match_status?: string;
}

// ------------------------------------------------------------
// 2) 默认数据源
// ------------------------------------------------------------
// 公司内部号码清单：这些号码不应该被当成客户来电，避免“总机/接待”误命中客户。
export const COMPANY_LINES: CompanyLine[] = [
  { number: "+14155550100", label: "Main line" },
  { number: "+14155550101", label: "Intake" },
];

// 默认客户库。实际生产环境中，通常会从 CRM/数据库加载，而不是写死在代码中。
export const DEFAULT_CLIENTS: Client[] = [
  {
    client_id: "C-101",
    name: "Maria Lopez",
    phone_hashes: [
      "eb17c0e3b9069a5042236c38fea7ce09a19722d2e1f38ae62a6af577f06a929b",
    ],
    cases: [
      {
        case_id: "CASE-9001",
        status: "closed",
        opened_at: "2025-01-14",
        closed_at: "2025-03-02",
      },
      {
        case_id: "CASE-9417",
        status: "open",
        opened_at: "2026-06-11",
        closed_at: null,
      },
    ],
  },
  {
    client_id: "C-102",
    name: "James Carter",
    phone_hashes: [
      "65e5cd5db364b55c145681e2db0975fc30e6831c10fe0d8ccf018122ae2fd723",
    ],
    cases: [
      {
        case_id: "CASE-8820",
        status: "open",
        opened_at: "2025-11-04",
        closed_at: null,
      },
      {
        case_id: "CASE-9550",
        status: "closed",
        opened_at: "2026-07-20",
        closed_at: "2026-09-01",
      },
    ],
  },
  {
    client_id: "C-103",
    name: "Linda Nguyen",
    phone_hashes: [
      "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
    ],
    cases: [
      {
        case_id: "CASE-9102",
        status: "open",
        opened_at: "2026-02-03",
        closed_at: null,
      },
    ],
  },
  {
    client_id: "C-104",
    name: "Robert Nguyen",
    phone_hashes: [
      "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
      "9b14d1e2164fe73cc354febb883730741e6217f7b685af9ab4403f25c94970a6",
    ],
    cases: [
      {
        case_id: "CASE-9103",
        status: "open",
        opened_at: "2026-02-03",
        closed_at: null,
      },
    ],
  },
  {
    client_id: "C-105",
    name: "David Kim",
    phone_hashes: [
      "ca8c01ad6c7826451572958a5b1eaa41d5b4ad178d837b0769705cef902687cd",
    ],
    cases: [
      {
        case_id: "CASE-7740",
        status: "closed",
        opened_at: "2024-08-19",
        closed_at: "2025-12-10",
      },
    ],
  },
  {
    client_id: "C-106",
    name: "Angela Brooks",
    phone_hashes: [
      "060767c859e08016ace3d3821bc002aaecbd295d9afce078030224d2deee2c87",
    ],
    cases: [
      {
        case_id: "CASE-9612",
        status: "open",
        opened_at: "2026-08-28",
        closed_at: null,
      },
    ],
  },
];

// ------------------------------------------------------------
// 3) 号码标准化与存储
// ------------------------------------------------------------
// CALL_STORE 用于保存唯一 call_id 的最终状态，保证重复事件不会导致记录重复或丢失。
export const CALL_STORE = new Map<string, CallRecord>();

// normalizePhone 将任意输入号码统一为 E.164（如 +12105550177）。
// 这样可以对不同格式的号码做统一判定，例如：
// "(210) 555-0177"、"2105550178"、"+1 210 555 0177" 都会被标准化到同一结果。
export function normalizePhone(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D+/g, "");
  if (!digits) {
    return null;
  }

  const normalized = digits.length === 10 ? `1${digits}` : digits;
  if (normalized.length !== 11 || !normalized.startsWith("1")) {
    return null;
  }

  return `+${normalized}`;
}

// hashPhoneNumber 用于把真实号码变成不可逆哈希。
// 这样可以在系统中对比号码，而不必在内存或日志中持有明文手机号。
export function hashPhoneNumber(
  number: string | null | undefined,
): string | null {
  const normalized = normalizePhone(number);
  if (!normalized) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(normalized.replace(/^\+/, ""))
    .digest("hex");
}

// verifySignature 用来校验 webhook 的 HMAC-SHA256 签名。
// 只接受以 sha256= 开头的签名，并用 timingSafeEqual 做恒时对比，避免时序攻击。
export function verifySignature(
  body: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = signatureHeader.slice("sha256=".length);
  if (expected.length !== 64) {
    return false;
  }

  const actual = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(actual, "hex");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// CALL_FIELDS 表示一条 call 的关键信息字段。
// 在合并事件时，遵循“新值覆盖旧值”的规则；如果新事件传的是 null 或 undefined，则保留旧值。
const CALL_FIELDS: Array<keyof CallEvent> = [
  "call_id",
  "direction",
  "state",
  "external_number",
  "internal_number",
  "date_started",
  "date_ended",
  "duration",
  "recording_url",
  "last_updated_at",
];

// buildCallRecord 是把多次上报的同一通电话合并成一条 canonical record 的核心逻辑。
// 这确保同一个 call_id 不会被重复展示，也不会因为乱序事件丢失主要值。
export function buildCallRecord(
  existing: Partial<CallRecord> = {},
  event: Partial<CallRecord> = {},
): CallRecord {
  const merged: Partial<CallRecord> = { ...existing };

  for (const key of CALL_FIELDS) {
    const value = event[key];
    if (value !== undefined && value !== null) {
      merged[key] = value as never;
    }
  }

  if (merged.last_updated_at === undefined || merged.last_updated_at === null) {
    merged.last_updated_at = Date.now();
  }

  return merged as CallRecord;
}

// getLatestOpenCase 返回客户当前最新的 open 案例。
// 也就是说：如果一个客户有多个未关闭案件，系统会优先返回最近打开的那个。
export function getLatestOpenCase(client: Client): ClientCase | null {
  const openCases = client.cases.filter((item) => item.status === "open");
  if (openCases.length === 0) {
    return null;
  }

  openCases.sort((a, b) =>
    (b.opened_at ?? "").localeCompare(a.opened_at ?? ""),
  );
  return openCases[0];
}

// ------------------------------------------------------------
// 4) 匹配规则
// ------------------------------------------------------------
// matchClientForCall 是整个系统最关键的方法：
// 1. 先判定是否是公司内部号码
// 2. 再看号码是否命中某个客户的 phone_hashes
// 3. 如果命中多个客户，返回 needs_review 让人工确认
// 4. 如果命中一个客户，则返回最新 open case；否则返回 customer_only
//
// 参数说明：
// - externalNumber：来电号码
// - clients：客户列表
// - companyLines：公司内部号码列表
//
// 返回值：MatchResult，描述当前号码的匹配状态和关联的 client / case。
export function matchClientForCall(
  externalNumber: string | null | undefined,
  clients: Client[] = DEFAULT_CLIENTS,
  companyLines: CompanyLine[] = COMPANY_LINES,
): MatchResult {
  const normalized = normalizePhone(externalNumber);
  if (!normalized) {
    return {
      status: "unmatched",
      client_id: null,
      case_id: null,
      reason: "invalid_number",
    };
  }

  const internalNumbers = new Set(
    companyLines.map((line) => normalizePhone(line.number)),
  );
  if (internalNumbers.has(normalized)) {
    return {
      status: "internal",
      client_id: null,
      case_id: null,
      reason: "company_line",
    };
  }

  const candidateHash = hashPhoneNumber(normalized);
  const matches = clients.filter((client) =>
    client.phone_hashes.includes(candidateHash ?? ""),
  );

  if (matches.length > 1) {
    return {
      status: "needs_review",
      client_id: null,
      case_id: null,
      reason: "multiple_clients_match",
      matched_clients: matches.map((client) => client.client_id),
    };
  }

  if (matches.length === 0) {
    return {
      status: "unmatched",
      client_id: null,
      case_id: null,
      reason: "no_client_match",
    };
  }

  const client = matches[0];
  const latestOpenCase = getLatestOpenCase(client);

  if (latestOpenCase) {
    return {
      status: "matched",
      client_id: client.client_id,
      case_id: latestOpenCase.case_id,
      reason: "latest_open_case",
      client_name: client.name,
    };
  }

  return {
    status: "customer_only",
    client_id: client.client_id,
    case_id: null,
    reason: "no_open_case",
    client_name: client.name,
  };
}

// processCallEvent 是 webhook 的处理入口：
// 先读出历史记录，再合并新事件，随后计算 match，最后写回 CALL_STORE。
//
// 业务效果：
// - 同一个 call_id 永远只保留一条最终记录
// - 每次事件都能刷新状态和匹配结果
// - 页面和 API 都读取这个同一份最终状态
export function processCallEvent(
  event: Partial<CallEvent>,
  clients: Client[] = DEFAULT_CLIENTS,
  companyLines: CompanyLine[] = COMPANY_LINES,
): CallRecord {
  const callId = event.call_id;
  if (!callId) {
    throw new Error("call_id is required");
  }

  const existing = CALL_STORE.get(callId) ?? {};
  const merged = buildCallRecord(existing, event);
  merged.match = matchClientForCall(
    merged.external_number ?? null,
    clients,
    companyLines,
  );
  merged.match_status = merged.match.status;
  CALL_STORE.set(callId, merged);
  return merged;
}
