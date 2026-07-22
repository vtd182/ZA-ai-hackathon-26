<script lang="ts">
  import type { SessionSummary } from "../model";

  export let sessions: SessionSummary[] = [];
  export let activeSessionId = "—";
  export let onSwitch: (sessionId: string) => void = () => {};
  export let onSwitchAndTest: (sessionId: string) => void = () => {};
</script>

<section class="panel session-panel">
  <div class="session-list">
    {#if sessions.length === 0}
      <div class="empty-state">
        <div class="empty-title">Chưa thấy session nào</div>
        <div class="empty-copy">Mở plugin trong file Figma khác để runtime catalog hiện đầy đủ tại đây.</div>
      </div>
    {:else}
      {#each sessions as session}
        <div
          class:active={session.sessionId === activeSessionId}
          class="session-card"
          role="button"
          tabindex="0"
          on:click={() => {
            if (session.sessionId !== activeSessionId) onSwitch(session.sessionId);
          }}
          on:keydown={(event) => {
            if (session.sessionId === activeSessionId) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSwitch(session.sessionId);
            }
          }}
        >
          <div class="session-top">
            <div class="session-title">
              <span class="session-file">{session.fileName || "Untitled file"}</span>
              {#if session.sessionId === activeSessionId}
                <span class="session-active-badge">Active</span>
              {/if}
            </div>
            <span class="session-selection">{session.selectionCount ?? 0} sel</span>
          </div>
          <div class="session-page">{session.pageName || "Unknown page"}</div>
          <div class="session-id">{session.sessionId}</div>
          <div class="session-actions">
            <button
              class="session-action secondary"
              type="button"
              on:click|stopPropagation={() => onSwitch(session.sessionId)}
              disabled={session.sessionId === activeSessionId}
            >
              {session.sessionId === activeSessionId ? "Active route" : "Switch"}
            </button>
            <button
              class="session-action primary"
              type="button"
              on:click|stopPropagation={() => onSwitchAndTest(session.sessionId)}
              disabled={session.sessionId === activeSessionId}
            >
              Switch &amp; test
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</section>

<style>
  .panel {
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #dde5f0;
  }

  .session-panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .session-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 12px 8px;
    overflow: auto;
  }

  .session-card {
    width: 100%;
    border: 0;
    border-bottom: 1px solid #edf2f7;
    background: transparent;
    border-radius: 0;
    padding: 10px 2px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 6px;
    cursor: pointer;
    transition: background 140ms ease;
  }

  .session-card:hover:not(:disabled) {
    background: #f8fbff;
  }

  .session-card:disabled {
    cursor: default;
  }

  .session-card.active {
    background: #f4f8ff;
  }

  .session-top,
  .session-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .session-file {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    min-width: 0;
  }

  .session-selection,
  .session-page {
    font-size: 11px;
    color: #64748b;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-active-badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    color: #1d4ed8;
    background: #e7efff;
  }

  .session-id {
    font-size: 10px;
    color: #94a3b8;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .session-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .session-action {
    border: none;
    border-radius: 10px;
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 140ms ease, background 140ms ease;
  }

  .session-action:hover:not(:disabled) {
    filter: brightness(0.98);
  }

  .session-action:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .session-action.secondary {
    color: #274690;
    background: #eff4fb;
  }

  .session-action.primary {
    color: #ffffff;
    background: #0f6eff;
  }

  .empty-state {
    min-height: 88px;
    border-radius: 12px;
    border: 1px dashed rgba(148, 163, 184, 0.46);
    background: rgba(248, 250, 252, 0.5);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8px;
    padding: 18px;
    color: #64748b;
  }

  .empty-title {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }

  .empty-copy {
    font-size: 12px;
    line-height: 1.5;
  }

  @media (max-width: 440px) {
    .session-card {
      padding: 10px 2px;
    }

    .session-top {
      align-items: flex-start;
    }

    .session-title {
      flex-direction: column;
      align-items: flex-start;
    }

    .session-file {
      font-size: 12px;
      line-height: 1.25;
    }

    .session-selection,
    .session-page {
      font-size: 10px;
    }
  }
</style>
