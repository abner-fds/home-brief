import crypto from "node:crypto";

export interface ClientCase {
  case_id: string;
  status: string;
  opened_at: string | null;
  closed_at: string | null;
}

export interface Client {
  client_id: string;
  name: string;
  phone_hashes: string[];
  cases: ClientCase[];
}

export interface CompanyLine {
  number: string;
  label: string;
}

export interface MatchResult {
  status: "matched" | "customer_only" | "internal" | "needs_review" | "unmatched";
  client_id: string | null;
  case_id: string | null;
  reason: string;
  client_name?: string;
  matched_clients?: string[];
}

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

export interface CallRecord extends CallEvent {
  match?: MatchResult;
  match_status?: string;
}

export const COMPANY_LINES: CompanyLine[] = [
  { number: "+14155550100", label: "Main line" },
  { number: "+14155550101", label: "Intake" },
];

export const DEFAULT_CLIENTS: Client[] = [
  {
    client_id: "C-101",
    name: "Maria Lopez",
    phone_hashes: [
      "eb17c0e3b9069a5042236c38fea7ce09a19722d2e1f38ae62a6af577f06a929b",
    ],
    cases: [
      { case_id: "CASE-9001", status: "closed", opened_at: "2025-01-14", closed_at: "2025-03-02" },
      { case_id: "CASE-9417", status: "open", opened_at: "2026-06-11", closed_at: null },
    ],
  },
  {
    client_id: "C-102",
    name: "James Carter",
    phone_hashes: [
      "65e5cd5db364b55c145681e2db0975fc30e6831c10fe0d8ccf018122ae2fd723",
    ],
    cases: [
      { case_id: "CASE-8820", status: "open", opened_at: "2025-11-04", closed_at: null },
      { case_id: "CASE-9550", status: "closed", opened_at: "2026-07-20", closed_at: "2026-09-01" },
    ],
  },
  {
    client_id: "C-103",
    name: "Linda Nguyen",
    phone_hashes: [
      "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
    ],
    cases: [{ case_id: "CASE-9102", status: "open", opened_at: "2026-02-03", closed_at: null }],
  },
  {
    client_id: "C-104",
    name: "Robert Nguyen",
    phone_hashes: [
      "1f2bd916d9e93906157a1bd4abfc024b1b64cb83eeef7ebfd1eebacf31065326",
      "9b14d1e2164fe73cc354febb883730741e6217f7b685af9ab4403f25c94970a6",
    ],
    cases: [{ case_id: "CASE-9103", status: "open", opened_at: "2026-02-03", closed_at: null }],
  },
  {
    client_id: "C-105",
    name: "David Kim",
    phone_hashes: [
      "ca8c01ad6c7826451572958a5b1eaa41d5b4ad178d837b0769705cef902687cd",
    ],
    cases: [{ case_id: "CASE-7740", status: "closed", opened_at: "2024-08-19", closed_at: "2025-12-10" }],
  },
  {
    client_id: "C-106",
    name: "Angela Brooks",
    phone_hashes: [
      "060767c859e08016ace3d3821bc002aaecbd295d9afce078030224d2deee2c87",
    ],
    cases: [{ case_id: "CASE-9612", status: "open", opened_at: "2026-08-28", closed_at: null }],
  },
];

export const CALL_STORE = new Map<string, CallRecord>();

export function normalizePhone(value: string | null | undefined): string | null {
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

export function hashPhoneNumber(number: string | null | undefined): string | null {
  const normalized = normalizePhone(number);
  if (!normalized) {
    return null;
  }

  return crypto.createHash("sha256").update(normalized.replace(/^\+/, "")).digest("hex");
}

export function verifySignature(body: Buffer | string, signatureHeader: string | undefined, secret: string): boolean {
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

export function buildCallRecord(existing: Partial<CallRecord> = {}, event: Partial<CallRecord> = {}): CallRecord {
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

export function getLatestOpenCase(client: Client): ClientCase | null {
  const openCases = client.cases.filter((item) => item.status === "open");
  if (openCases.length === 0) {
    return null;
  }

  openCases.sort((a, b) => (b.opened_at ?? "").localeCompare(a.opened_at ?? ""));
  return openCases[0];
}

export function matchClientForCall(
  externalNumber: string | null | undefined,
  clients: Client[] = DEFAULT_CLIENTS,
  companyLines: CompanyLine[] = COMPANY_LINES,
): MatchResult {
  const normalized = normalizePhone(externalNumber);
  if (!normalized) {
    return { status: "unmatched", client_id: null, case_id: null, reason: "invalid_number" };
  }

  const internalNumbers = new Set(companyLines.map((line) => normalizePhone(line.number)));
  if (internalNumbers.has(normalized)) {
    return { status: "internal", client_id: null, case_id: null, reason: "company_line" };
  }

  const candidateHash = hashPhoneNumber(normalized);
  const matches = clients.filter((client) => client.phone_hashes.includes(candidateHash ?? ""));

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
    return { status: "unmatched", client_id: null, case_id: null, reason: "no_client_match" };
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
  merged.match = matchClientForCall(merged.external_number ?? null, clients, companyLines);
  merged.match_status = merged.match.status;
  CALL_STORE.set(callId, merged);
  return merged;
}
