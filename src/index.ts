import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CALL_STORE, DEFAULT_CLIENTS, COMPANY_LINES, processCallEvent, verifySignature } from "./callMatching.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "take-home-secret";

function renderQueueHtml(): string {
  const rows = Array.from(CALL_STORE.values());
  const cells = rows.length > 0
    ? rows.map((row) => {
        const match = row.match ?? { status: "pending", client_id: null, case_id: null, reason: "pending" };
        const clientLabel = "client_name" in match ? match.client_name ?? match.client_id ?? "—" : match.client_id ?? "—";
        return `
          <tr>
            <td>${row.call_id ?? "—"}</td>
            <td>${row.direction ?? "—"}</td>
            <td>${row.state ?? "—"}</td>
            <td>${row.external_number ?? "—"}</td>
            <td>${clientLabel}</td>
            <td>${match.case_id ?? "No open case"}</td>
            <td>${match.status}</td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="7">No calls queued</td></tr>';

  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Ops Review Queue</title>
    </head>
    <body>
      <h1>Ops Review Queue</h1>
      <table border="1" cellpadding="6" cellspacing="0">
        <thead>
          <tr>
            <th>Call ID</th>
            <th>Direction</th>
            <th>State</th>
            <th>External Number</th>
            <th>Client</th>
            <th>Case</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${cells}</tbody>
      </table>
    </body>
  </html>`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(renderQueueHtml());
    return;
  }

  if (request.method === "GET" && url.pathname === "/calls") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(Array.from(CALL_STORE.values())));
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/dialpad") {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      const signature = request.headers["x-signature"];
      const signatureValue = Array.isArray(signature) ? signature[0] : signature;

      if (!verifySignature(rawBody, signatureValue, WEBHOOK_SECRET)) {
        response.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("invalid signature");
        return;
      }

      try {
        const parsed = JSON.parse(rawBody.toString("utf-8"));
        const events = Array.isArray(parsed) ? parsed : [parsed];
        const results = events.map((event) => processCallEvent(event, DEFAULT_CLIENTS, COMPANY_LINES));
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify(results));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("invalid json");
      }
    });
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("not found");
});

export function startServer(port: number = PORT): void {
  server.listen(port, () => {
    console.log(`Serving call matching queue at http://localhost:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
