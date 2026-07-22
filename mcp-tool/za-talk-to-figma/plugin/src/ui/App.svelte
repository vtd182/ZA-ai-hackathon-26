<script lang="ts">
  import { onMount } from "svelte";
  import ActivityPanel from "./panels/ActivityPanel.svelte";
  import SessionPanel from "./panels/SessionPanel.svelte";
  import type { ActiveRequest, SessionSummary } from "./model";

  type SelectionNode = { id: string; name: string; type: string };

  let connected = false;
  let currentSessionId = "—";
  let fileName = "—";
  let pageName = "—";
  let selectionCount = 0;
  let selection: SelectionNode[] = [];
  let knownSessions: SessionSummary[] = [];
  let catalogReady = false;
  let showSessions = false;
  let showSettings = false;

  let activeRequestMap: Record<string, ActiveRequest> = {};

  $: activeRequests = Object.values(activeRequestMap).sort((a, b) => a.startedAt - b.startedAt);
  $: isWorking = activeRequests.length > 0;
  $: sessionCount = catalogReady ? knownSessions.length : 0;
  $: adminURL = `http://${serverHost}:${serverPort}/admin`;
  $: statusLabel = connected ? (isWorking ? "Working" : "Ready") : "Disconnected";

  let serverHost = "127.0.0.1";
  let serverPort = "1802";
  let editHost = serverHost;
  let editPort = serverPort;

  const RECONNECT_DELAY_MS = 1500;
  const REQUEST_SETTLE_DELAY_MS = 900;

  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sessionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let configLoaded = false;
  const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const reassignRequests = () => { activeRequestMap = { ...activeRequestMap }; };

  const clearCleanupTimer = (requestId: string) => {
    const timer = cleanupTimers.get(requestId);
    if (timer) { clearTimeout(timer); cleanupTimers.delete(requestId); }
  };

  const scheduleFinishRequest = (requestId: string) => {
    clearCleanupTimer(requestId);
    cleanupTimers.set(requestId, setTimeout(() => {
      delete activeRequestMap[requestId];
      cleanupTimers.delete(requestId);
      reassignRequests();
    }, REQUEST_SETTLE_DELAY_MS));
  };

  const ensureActiveRequest = (requestId: string, tool: string) => {
    if (!activeRequestMap[requestId]) {
      activeRequestMap[requestId] = {
        requestId, tool,
        stage: "queued", progress: 0,
        message: "Queued",
        startedAt: Date.now(),
        lastDebugMessage: "", lastDebugProgress: -1,
      };
      reassignRequests();
    }
    return activeRequestMap[requestId];
  };

  const requestSessionCatalog = () => {
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "session_request_catalog" }));
  };

  const openAdmin = () => {
    parent.postMessage({ pluginMessage: { type: "open_external", url: adminURL } }, "*");
  };

  const switchSession = (sessionId: string) => {
    if (!sessionId || sessionId === currentSessionId || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "session_switch", sessionId }));
  };

  const switchSessionAndTest = (sessionId: string) => {
    if (!sessionId || socket?.readyState !== WebSocket.OPEN) return;
    switchSession(sessionId);
    setTimeout(requestSessionCatalog, 240);
  };

  const announceSession = () => {
    if (socket?.readyState !== WebSocket.OPEN || currentSessionId === "—") return;
    socket.send(JSON.stringify({
      type: "session_announce",
      sessionId: currentSessionId, fileName, pageName, selectionCount,
    }));
    requestSessionCatalog();
  };

  const stopSessionRetry = () => {
    if (sessionRetryTimer !== null) { clearTimeout(sessionRetryTimer); sessionRetryTimer = null; }
  };

  const scheduleSessionRetry = () => {
    stopSessionRetry();
    if (catalogReady || socket?.readyState !== WebSocket.OPEN || currentSessionId === "—") return;
    sessionRetryTimer = setTimeout(() => {
      sessionRetryTimer = null;
      if (!catalogReady) { announceSession(); scheduleSessionRetry(); }
    }, 1800);
  };

  function connect() {
    if (socket) { socket.onclose = null; socket.close(); }
    const ws = new WebSocket(`ws://${serverHost}:${serverPort}/ws`);
    socket = ws;

    ws.onopen = () => {
      connected = true;
      parent.postMessage({ pluginMessage: { type: "ui-ready" } }, "*");
      announceSession();
      requestSessionCatalog();
      scheduleSessionRetry();
    };

    ws.onclose = () => {
      if (socket !== ws) return;
      connected = false; socket = null; catalogReady = false; knownSessions = [];
      stopSessionRetry();
      activeRequestMap = {};
      cleanupTimers.forEach((t) => clearTimeout(t)); cleanupTimers.clear();
      if (reconnectTimer === null) {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, RECONNECT_DELAY_MS);
      }
    };

    ws.onerror = () => { connected = false; };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === "session_catalog") {
          const active = payload.data?.activeSession ?? currentSessionId;
          const sessions = Array.isArray(payload.data?.sessions) ? payload.data.sessions : [];
          catalogReady = true;
          stopSessionRetry();
          currentSessionId = active;
          knownSessions = sessions
            .map((s: any) => ({
              sessionId: s.sessionId,
              fileName: s.fileName ?? "Untitled file",
              pageName: s.pageName ?? "Unknown page",
              selectionCount: s.selectionCount ?? 0,
            }))
            .sort((a: SessionSummary, b: SessionSummary) => a.fileName.localeCompare(b.fileName));
          return;
        }

        if (payload.requestId && payload.type !== "execution_report") {
          ensureActiveRequest(payload.requestId, payload.type ?? "tool");
        }
        parent.postMessage({ pluginMessage: { type: "server-request", payload } }, "*");
      } catch { /* malformed frame */ }
    };
  }

  function handleMessage(event: MessageEvent) {
    const msg = event.data?.pluginMessage;
    if (!msg) return;

    if (msg.type === "ws_config") {
      serverHost = msg.host ?? "127.0.0.1";
      serverPort = msg.port ?? "1802";
      if (!configLoaded) { configLoaded = true; connect(); }
      return;
    }

    if (msg.type === "plugin-status") {
      currentSessionId = msg.payload.sessionId ?? currentSessionId;
      fileName = msg.payload.fileName;
      pageName = msg.payload.pageName ?? "—";
      selectionCount = msg.payload.selectionCount;
      selection = msg.payload.selection ?? [];
      announceSession();
      scheduleSessionRetry();
      return;
    }

    if (msg.type === "request_event") {
      const payload = msg.payload ?? {};
      const requestId = payload.requestId;
      const tool = payload.type ?? "tool";
      if (typeof requestId === "string") {
        clearCleanupTimer(requestId);
        const entry = ensureActiveRequest(requestId, tool);
        entry.stage = msg.stage;
        if (msg.stage === "start") {
          entry.message = "Running";
        } else if (msg.stage === "success") {
          entry.progress = 100;
          entry.message = `Done · ${payload.durationMs ?? 0} ms`;
          scheduleFinishRequest(requestId);
        } else if (msg.stage === "error") {
          entry.progress = 100;
          entry.message = payload.error ?? "Error";
          scheduleFinishRequest(requestId);
        }
        reassignRequests();
      }
      return;
    }

    if (msg.type === "progress_update" && typeof msg.requestId === "string") {
      clearCleanupTimer(msg.requestId);
      const entry = ensureActiveRequest(msg.requestId, activeRequestMap[msg.requestId]?.tool ?? "tool");
      entry.stage = "progress";
      entry.progress = typeof msg.progress === "number" ? msg.progress : entry.progress;
      entry.message = msg.message ?? "Running";
      reassignRequests();
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
      return;
    }

    if (msg.type === "execution_report") {
      // Telemetry-only — do not create activity entries or relay to server
      return;
    }

    if ("requestId" in msg) {
      const requestId = typeof msg.requestId === "string" ? msg.requestId : "";
      const tool = msg.type ?? activeRequestMap[requestId]?.tool ?? "tool";
      if (requestId) {
        clearCleanupTimer(requestId);
        const entry = ensureActiveRequest(requestId, tool);
        entry.progress = 100;
        entry.stage = msg.error ? "error" : "done";
        entry.message = msg.error ? msg.error : "Done";
        reassignRequests();
        scheduleFinishRequest(requestId);
      }
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
    }
  }

  function typeLabel(type: string): string {
    const map: Record<string, string> = {
      FRAME: "F", COMPONENT: "C", COMPONENT_SET: "CS", INSTANCE: "I",
      GROUP: "G", TEXT: "T", RECTANGLE: "R", ELLIPSE: "E",
      VECTOR: "V", LINE: "L", SECTION: "S", BOOLEAN_OPERATION: "B",
      POLYGON: "P", STAR: "★",
    };
    return map[type] ?? type.charAt(0);
  }

  function typeAccent(type: string): string {
    if (type === "FRAME" || type === "SECTION") return "#0068FF";
    if (type === "COMPONENT" || type === "COMPONENT_SET") return "#8E45FF";
    if (type === "INSTANCE") return "#18BDF5";
    if (type === "TEXT") return "#FF5A3F";
    if (type === "GROUP") return "#64748b";
    return "#13C98B";
  }

  function openSettings() { editHost = serverHost; editPort = serverPort; showSettings = true; }

  function applySettings() {
    serverHost = editHost.trim() || "127.0.0.1";
    const parsed = parseInt(editPort, 10);
    serverPort = parsed > 0 && parsed <= 65535 ? String(parsed) : "1802";
    parent.postMessage({ pluginMessage: { type: "save_ws_config", host: serverHost, port: serverPort } }, "*");
    showSettings = false;
    if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    connect();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") applySettings();
    if (event.key === "Escape") showSettings = false;
  }

  onMount(() => {
    window.addEventListener("message", handleMessage);
    parent.postMessage({ pluginMessage: { type: "get_ws_config" } }, "*");
    const fallback = setTimeout(() => { if (!configLoaded) { configLoaded = true; connect(); } }, 500);
    return () => {
      clearTimeout(fallback);
      window.removeEventListener("message", handleMessage);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      stopSessionRetry();
      cleanupTimers.forEach((t) => clearTimeout(t)); cleanupTimers.clear();
      if (socket) socket.close();
    };
  });
</script>

<div class="shell">

  <!-- ── HEADER ── -->
  <section class="header-card">
    <div class="top-row">
      <div class="brand">
        <div class="brand-logo">
          <svg width="28" height="28" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="zf-bg" x1="128" y1="72" x2="896" y2="952" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#F7FCFF"/><stop offset="1" stop-color="#EAF6FF"/>
              </linearGradient>
              <filter id="zf-sh" x="120" y="160" width="800" height="700" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="20" stdDeviation="28" flood-color="#0068FF" flood-opacity="0.18"/>
              </filter>
              <filter id="zf-ch" x="580" y="290" width="320" height="380" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0B2250" flood-opacity="0.13"/>
              </filter>
            </defs>
            <rect x="64" y="64" width="896" height="896" rx="212" fill="url(#zf-bg)"/>
            <rect x="64" y="64" width="896" height="896" rx="212" stroke="#D9F0FF" stroke-width="8"/>
            <g filter="url(#zf-sh)">
              <path d="M230 255L600 255L600 341L350 599L600 599L600 685L230 685L230 599L480 341L230 341Z" fill="#0068FF" stroke="#0068FF" stroke-width="6" stroke-linejoin="round"/>
              <circle cx="375" cy="642" r="12" fill="white" fill-opacity="0.92"/>
              <circle cx="415" cy="642" r="12" fill="white" fill-opacity="0.92"/>
              <circle cx="455" cy="642" r="12" fill="white" fill-opacity="0.92"/>
            </g>
            <g filter="url(#zf-ch)">
              <rect x="640" y="340" width="172" height="86" rx="43" fill="#FF5A3F"/>
              <rect x="640" y="426" width="86" height="86" rx="43" fill="#8E45FF"/>
              <rect x="726" y="426" width="86" height="86" rx="43" fill="#18BDF5"/>
              <rect x="640" y="512" width="86" height="86" rx="43" fill="#13C98B"/>
              <rect x="726" y="512" width="86" height="86" rx="43" fill="#0077FF" fill-opacity="0.10"/>
            </g>
          </svg>
        </div>
        <span class="brand-name">Runtime Console</span>
      </div>
      <div
        class:status-pill={true}
        class:connected
        class:disconnected={!connected}
        class:working={isWorking}
      >
        <span class="sdot"></span>
        <span>{statusLabel}</span>
      </div>
    </div>

    <div class="info-rows">
      <div class="info-row-1">
        <span class="i-ep">{serverHost}:{serverPort}</span>
      </div>
      {#if fileName !== "—" || pageName !== "—"}
        <div class="info-row-2">
          {#if fileName !== "—"}
            <span class="i-file" title={fileName}>{fileName}</span>
          {/if}
          {#if pageName !== "—"}
            {#if fileName !== "—"}<span class="i-dot">·</span>{/if}
            <span class="i-page" title={pageName}>{pageName}</span>
          {/if}
        </div>
      {/if}
    </div>

    <div class="sel-row">
      {#if selection.length === 0}
        <span class="sel-empty">Nothing selected</span>
      {:else}
        {#each selection.slice(0, 3) as node (node.id)}
          <span class="sel-chip" title="{node.type}: {node.name}">
            <span class="sel-dot" style="background: {typeAccent(node.type)}"></span>
            <span class="sel-name">{node.name}</span>
          </span>
        {/each}
        {#if selection.length > 3}
          <span class="sel-more">+{selection.length - 3}</span>
        {/if}
      {/if}
    </div>

    <div class="action-row">
      <button class="btn icon" title="Refresh" on:click={requestSessionCatalog}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/>
          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/>
        </svg>
      </button>
      <button class="btn" on:click={() => (showSessions = true)}>
        Sessions{#if sessionCount > 0}&nbsp;<span class="badge">{sessionCount}</span>{/if}
      </button>
      <button class="btn icon" title="Settings" on:click={openSettings}>⚙</button>
    </div>
  </section>

  <!-- ── ACTIVITY ── -->
  <section class="activity-shell">
    <div class="act-head">
      <span>Activity</span>
      {#if activeRequests.length > 0}<span class="act-badge">{activeRequests.length}</span>{/if}
    </div>
    <ActivityPanel {activeRequests} showHeader={false} compact={true} />
  </section>

  <!-- ── MODAL: Sessions ── -->
  {#if showSessions}
    <div class="overlay" role="button" tabindex="0"
      on:click={() => (showSessions = false)}
      on:keydown={(e) => { if (e.key === "Escape") showSessions = false; }}>
      <div class="modal" role="dialog" aria-modal="true" tabindex="-1"
        on:click|stopPropagation on:keydown|stopPropagation>
        <div class="modal-head">
          <span class="modal-title">Sessions</span>
          <div class="modal-actions">
            <button class="btn" on:click={requestSessionCatalog}>Refresh</button>
            <button class="btn primary" on:click={() => (showSessions = false)}>Close</button>
          </div>
        </div>
        <div class="modal-body">
          <SessionPanel
            sessions={knownSessions}
            activeSessionId={currentSessionId}
            onSwitch={switchSession}
            onSwitchAndTest={switchSessionAndTest}
          />
        </div>
      </div>
    </div>
  {/if}

  <!-- ── MODAL: Settings ── -->
  {#if showSettings}
    <div class="overlay" role="button" tabindex="0"
      on:click={() => (showSettings = false)}
      on:keydown={(e) => { if (e.key === "Escape") showSettings = false; }}>
      <div class="modal" role="dialog" aria-modal="true" tabindex="-1"
        on:click|stopPropagation on:keydown|stopPropagation>
        <div class="modal-head">
          <span class="modal-title">Settings</span>
          <div class="modal-actions">
            <button class="btn primary" on:click={() => (showSettings = false)}>Close</button>
          </div>
        </div>
        <div class="modal-body">
          <div class="fields-row">
            <label class="field">
              <span>Host</span>
              <input bind:value={editHost} placeholder="127.0.0.1" on:keydown={handleKeydown} />
            </label>
            <label class="field">
              <span>Port</span>
              <input bind:value={editPort} placeholder="1802" on:keydown={handleKeydown} />
            </label>
          </div>
          <div class="settings-actions">
            <button class="btn primary" on:click={applySettings}>Apply & reconnect</button>
            <button class="btn" on:click={openAdmin}>Open admin</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
  :global(*) { box-sizing: border-box; margin: 0; padding: 0; }

  :global(body) {
    font-family: "Plus Jakarta Sans", Inter, "Segoe UI", system-ui, sans-serif;
    font-size: 12px;
    color: #0f172a;
    height: 100vh;
    background: #edf1f8;
  }

  .shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  /* ── Header card ── */
  .header-card {
    background: #fff;
    border: 1px solid #dde5f0;
    border-radius: 14px;
    padding: 12px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .brand-logo {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .brand-name {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }

  /* ── Status pill ── */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 9px 4px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    background: rgba(74,222,128,0.14);
    color: #15803d;
  }
  .status-pill.disconnected { background: rgba(251,113,133,0.14); color: #be123c; }
  .status-pill.working      { background: rgba(96,165,250,0.14);  color: #1d4ed8; }

  .sdot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #4ade80;
  }
  .status-pill.disconnected .sdot { background: #fb7185; }
  .status-pill.working      .sdot { background: #60a5fa; animation: pulse 1.1s ease-in-out infinite; }

  @keyframes pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%     { opacity: 0.35; transform: scale(0.6); }
  }

  /* ── Info rows ── */
  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
  }

  .info-row-1 {
    display: flex;
    align-items: center;
  }

  .info-row-2 {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
  }

  .i-ep {
    font-size: 10.5px;
    font-family: "SF Mono", "Fira Mono", Consolas, monospace;
    font-weight: 600;
    color: #64748b;
    white-space: nowrap;
  }
  .i-dot { font-size: 10px; color: #cbd5e1; flex-shrink: 0; }
  .i-file {
    font-size: 10.5px; font-weight: 600; color: #334155;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0; flex-shrink: 1;
  }
  .i-page {
    font-size: 10.5px; color: #94a3b8;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0; flex-shrink: 2;
  }

  /* ── Selection row ── */
  .sel-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    padding-top: 2px;
  }

  .sel-empty {
    font-size: 10.5px;
    color: #94a3b8;
    font-style: italic;
  }

  .sel-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px 3px 6px;
    background: #f1f5f9;
    border-radius: 6px;
    max-width: 130px;
    overflow: hidden;
    cursor: default;
  }

  .sel-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sel-name {
    font-size: 10.5px;
    font-weight: 500;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .sel-more {
    font-size: 10px;
    font-weight: 700;
    color: #64748b;
    padding: 3px 6px;
    background: #f1f5f9;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    flex-shrink: 0;
  }

  /* ── Action row ── */
  .action-row {
    display: flex;
    gap: 5px;
    padding-top: 2px;
  }

  /* ── Buttons ── */
  .btn {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: #f1f5fb;
    color: #334268;
    font-size: 11.5px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    font-family: inherit;
    transition: background 100ms;
    min-width: 0;
  }
  .btn:hover { background: #e4ecf8; }
  .btn.primary { background: #0f6eff; color: #fff; flex: 0 0 auto; }
  .btn.primary:hover { background: #0459d8; }
  .btn.icon { flex: 0 0 32px; font-size: 13px; color: #64748b; }

  .badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 14px; height: 14px; padding: 0 3px;
    border-radius: 999px;
    background: #dce8ff; color: #1d4ed8;
    font-size: 9px; font-weight: 700;
  }

  /* ── Activity ── */
  .activity-shell {
    flex: 1;
    min-height: 0;
    background: #fff;
    border: 1px solid #dde5f0;
    border-radius: 14px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .act-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .act-badge {
    min-width: 20px; height: 20px;
    border-radius: 999px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 10.5px; color: #2563eb;
    background: rgba(37,99,235,0.08);
  }

  :global(.activity-shell .panel) { border: 0; border-radius: 0; background: transparent; flex: 1; min-height: 0; }

  /* ── Overlay ── */
  .overlay {
    position: fixed; inset: 0; z-index: 20;
    background: rgba(15,23,42,0.22);
    display: flex; align-items: flex-end; justify-content: center;
    padding: 10px;
  }

  /* ── Modal ── */
  .modal {
    width: min(100%, 480px);
    max-height: min(80vh, 640px);
    border-radius: 16px;
    border: 1px solid #d7e0ec;
    background: #fff;
    display: flex; flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(15,23,42,0.16);
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 14px 10px;
    border-bottom: 1px solid #edf2f9;
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .modal-actions {
    display: flex; gap: 6px; align-items: center;
  }

  .modal-body {
    min-height: 0;
    display: flex; flex-direction: column;
    gap: 10px;
    padding: 12px;
    overflow: auto;
    background: #f8fafc;
  }

  /* ── Settings fields ── */
  .fields-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .field {
    display: flex; flex-direction: column; gap: 5px;
  }
  .field span {
    font-size: 10.5px; font-weight: 700; color: #64748b;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .field input {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit; color: #0f172a;
    background: #fff; outline: none;
  }
  .field input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
  }

  .settings-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  /* ── Responsive ── */
  @media (max-width: 380px) {
    .shell { padding: 8px; gap: 5px; }
    .header-card, .activity-shell { border-radius: 12px; }
    .fields-row { grid-template-columns: 1fr; }
  }
</style>
