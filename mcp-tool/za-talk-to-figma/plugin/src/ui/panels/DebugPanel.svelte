<script lang="ts">
  import type { DebugEvent } from "../model";

  export let debugEvents: DebugEvent[] = [];
  export let showDebug = true;
  export let onToggle: () => void = () => {};
</script>

<section class="panel debug-panel">
  <button class="panel-header panel-toggle" on:click={onToggle}>
    <span>Debug Console</span>
    <span class="toggle-label">{showDebug ? "Hide" : "Show"}</span>
  </button>
  {#if showDebug}
    <div class="debug-list">
      {#if debugEvents.length === 0}
        <div class="empty-state compact">
          <div class="empty-title">Chưa có event</div>
        </div>
      {:else}
        {#each debugEvents as event}
          <div class={`debug-item tone-${event.tone}`}>
            <div class="debug-meta">
              <span class="debug-time">{event.timestamp}</span>
              <span class="debug-tool">{event.tool}</span>
              <span class="debug-stage">{event.stage}</span>
            </div>
            <div class="debug-message">{event.message}</div>
            {#if event.requestId}
              <div class="debug-id">{event.requestId}</div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel {
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid #dde5f0;
  }

  .debug-panel {
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px 8px;
    font-size: 12px;
    font-weight: 700;
    color: #0f172a;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .panel-toggle {
    width: 100%;
    border: 0;
    background: transparent;
    cursor: pointer;
  }

  .toggle-label {
    font-size: 11px;
    color: #2563eb;
  }

  .debug-list {
    max-height: 200px;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 14px 8px;
    overflow: auto;
  }

  .debug-item {
    border-radius: 0;
    padding: 10px 2px;
    border: 0;
    border-bottom: 1px solid #edf2f7;
    background: transparent;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .debug-item.tone-success {
    background: #f8fff9;
  }

  .debug-item.tone-error {
    background: #fff8f8;
  }

  .debug-item.tone-warn {
    background: #fffaf0;
  }

  .debug-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: #64748b;
  }

  .debug-tool {
    font-weight: 700;
    color: #0f172a;
  }

  .debug-message {
    font-size: 12px;
    line-height: 1.45;
    color: #1e293b;
  }

  .debug-id {
    font-size: 10px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    min-height: 72px;
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

  @media (max-width: 440px) {
    .panel-header {
      padding: 12px 14px 8px;
      font-size: 11px;
    }

    .debug-item {
      padding: 10px 2px;
    }
  }
</style>
