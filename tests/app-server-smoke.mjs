import { spawn } from "node:child_process";

const codex = process.env.CODEX_BIN || "/Applications/ChatGPT.app/Contents/Resources/codex";
const port = Number(process.env.CODEX_TEST_PORT || 45124);
const url = `ws://127.0.0.1:${port}`;
const child = spawn(codex, ["app-server", "--listen", url], {
  stdio: ["ignore", "ignore", "pipe"],
});

let nextID = 1;
const pending = new Map();

function request(socket, method, params) {
  const id = nextID++;
  socket.send(JSON.stringify({ method, id, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connectWithRetry() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        socket.addEventListener("open", () => resolve(socket), { once: true });
        socket.addEventListener("error", () => reject(new Error("not ready")), { once: true });
      });
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("app-server did not start");
}

try {
  const socket = await connectWithRetry();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && !message.method) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
  });

  await request(socket, "initialize", {
    clientInfo: { name: "zotero_codex_smoke_test", title: "Zotero smoke test", version: "0.1.0" },
    capabilities: null,
  });
  socket.send(JSON.stringify({ method: "initialized", params: {} }));
  const account = await request(socket, "account/read", { refreshToken: false });
  const rateLimits = account.account
    ? await request(socket, "account/rateLimits/read")
    : null;
  const models = await request(socket, "model/list", { limit: 100, includeHidden: false });
  const history = await request(socket, "thread/list", {
    limit: 1,
    sortKey: "updated_at",
    sortDirection: "desc",
    sourceKinds: ["appServer"],
    archived: false,
  });
  let historyReadable = true;
  if (history.data?.[0]?.id) {
    const stored = await request(socket, "thread/read", {
      threadId: history.data[0].id,
      includeTurns: true,
    });
    historyReadable = Boolean(stored.thread && Array.isArray(stored.thread.turns));
  }
  console.log(JSON.stringify({
    ok: true,
    accountType: account.account?.type || null,
    historyList: Array.isArray(history.data),
    historyReadable,
    modelList: Array.isArray(models.data) && models.data.length > 0,
    modelEfforts: Array.isArray(models.data?.[0]?.supportedReasoningEfforts),
    modelServiceTiers: (models.data || [])
      .filter((model) => Array.isArray(model.serviceTiers) && model.serviceTiers.length)
      .map((model) => ({
        id: model.id,
        tiers: model.serviceTiers.map((tier) => ({
          id: tier.id,
          name: tier.name,
          description: tier.description,
        })),
      })),
    rateLimitsReadable: !account.account || Boolean(rateLimits && "rateLimits" in rateLimits),
    rateLimitWindows: [
      rateLimits?.rateLimits?.primary,
      rateLimits?.rateLimits?.secondary,
    ].filter(Boolean).map((window) => window.windowDurationMins),
  }));
  socket.close();
} finally {
  child.kill("SIGTERM");
}
