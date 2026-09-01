import { resolve } from "node:path";

const port = Number(process.env.ZOTERO_REMOTE_PORT || 9223);
const xpi = resolve(process.argv[2] || "dist/cortex-for-zotero.xpi");
const socket = new WebSocket(`ws://127.0.0.1:${port}/session`);
const pending = new Map();
let nextID = 1;

function remoteString(result) {
  const value = result && result.result;
  if (!value || value.type !== "string") {
    throw new Error(`Expected a remote string, got ${JSON.stringify(result)}`);
  }
  return value.value;
}

function request(method, params) {
  const id = nextID++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveRequest, rejectRequest) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectRequest(new Error(`Timed out waiting for ${method}`));
    }, method === "session.new" ? 60000 : 15000);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolveRequest(value);
      },
      reject(error) {
        clearTimeout(timer);
        rejectRequest(error);
      },
    });
  });
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  console.error(`BiDi ← ${JSON.stringify(message)}`);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.type === "error") {
    waiter.reject(new Error(`${message.error}: ${message.message}\n${message.stacktrace || ""}`));
  } else {
    waiter.resolve(message.result);
  }
});

socket.addEventListener("close", () => {
  for (const waiter of pending.values()) {
    waiter.reject(new Error("Zotero BiDi connection closed"));
  }
  pending.clear();
});

await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", () => rejectOpen(new Error("Cannot connect to Zotero BiDi")), {
    once: true,
  });
});

try {
  if (process.env.ZOTERO_BIDI_SESSION_ACTIVE !== "1") {
    console.error("Creating isolated Zotero BiDi session…");
    const sessionRequest = request("session.new", { capabilities: { alwaysMatch: {} } });
    const sessionState = await Promise.race([
      sessionRequest.then(() => "ready"),
      new Promise((resolveDelay) => setTimeout(() => resolveDelay("pending"), 5000)),
    ]);
    if (sessionState === "pending") {
      console.error("Session creation is still pending; continuing on the same connection…");
      sessionRequest.catch(() => {});
    }
  } else {
    console.error("Reusing the active isolated Zotero BiDi session…");
  }
  console.error(`Validating ${xpi}…`);
  const result = await request("webExtension.install", {
    extensionData: { type: "archivePath", path: xpi },
    "moz:permanent": false,
  });
  console.log(JSON.stringify({ ok: true, extension: result.extension, xpi }));

  if (process.env.ZOTERO_UI_SMOKE === "1") {
    const tree = await request("browsingContext.getTree", {});
    const mainContext = tree.contexts.find((context) => context.url.includes("zoteroPane"))
      || tree.contexts[0];
    if (!mainContext) {
      console.log(JSON.stringify({ ok: true, ui: { skipped: "no-browsing-context" } }));
    } else {

      const evaluation = await request("script.evaluate", {
        expression: `(async () => {
        const item = new Zotero.Item("journalArticle");
        item.setField("title", "Codex UI Smoke Test");
        item.setField("abstractNote", "A short abstract used to verify the sidebar composer.");
        const itemID = await item.saveTx();
        let attachmentReads = 0;
        const originalGetBestAttachment = item.getBestAttachment.bind(item);
        item.getBestAttachment = async (...args) => {
          attachmentReads += 1;
          return originalGetBestAttachment(...args);
        };
        await Zotero.getMainWindow().ZoteroPane.selectItem(itemID);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));

        const pane = document.querySelector(
          'item-pane-custom-section[data-pane*="zotero-codex-chat"]'
        );
        if (!pane) return JSON.stringify({ ok: false, reason: "pane-not-found" });
        pane.open = true;
        await pane._forceRenderAll();
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
        const paperOK = Boolean(pane.querySelector("textarea.zcs-input"));
        const paperLazy = attachmentReads === 0
          && pane.textContent.includes("等待提问后读取论文");

        const collection = new Zotero.Collection();
        collection.libraryID = item.libraryID;
        collection.name = "Cortex Collection Smoke Test";
        await collection.saveTx();
        await collection.addItem(itemID);
        let collectionReads = 0;
        const originalGetChildItems = collection.getChildItems.bind(collection);
        collection.getChildItems = (...args) => {
          collectionReads += 1;
          return originalGetChildItems(...args);
        };
        await Zotero.getMainWindow().ZoteroPane.collectionsView.selectCollection(collection.id);
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 800));
        const collectionHost = document.querySelector(".zcs-collection-panel-host");
        const collectionOK = Boolean(collectionHost?.querySelector("textarea.zcs-input"));
        const collectionLazy = collectionReads === 0
          && collectionHost?.textContent.includes("等待提问后读取分类");
        return JSON.stringify({
          ok: paperOK && paperLazy && collectionOK && collectionLazy,
          hasSendButton: Boolean(pane.querySelector("button.zcs-send")),
          paperLazy,
          collectionOK,
          collectionLazy,
          text: collectionHost?.textContent.trim().slice(0, 300) || "",
        });
      })()`,
        target: { context: mainContext.context },
        awaitPromise: true,
        resultOwnership: "none",
      });
      const ui = JSON.parse(remoteString(evaluation));
      if (!ui.ok || !ui.hasSendButton) {
        throw new Error(`Zotero sidebar UI smoke test failed: ${JSON.stringify(ui)}`);
      }
      console.log(JSON.stringify({ ok: true, ui }));
    }
  }
} finally {
  try {
    await request("session.end", {});
  } catch {
    // The session may already be closed after a failed install.
  }
  socket.close();
}
