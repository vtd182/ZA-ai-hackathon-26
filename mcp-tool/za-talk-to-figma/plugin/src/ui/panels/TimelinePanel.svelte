<script lang="ts">
  import type { TimelineEvent } from "../model";

  export let timelineEvents: TimelineEvent[] = [];
  export let showTimeline = false;
  export let onToggle: () => void = () => {};
</script>

<section class="panel timeline-panel">
  <button class="panel-header panel-toggle" on:click={onToggle}>
    <span>Operation Timeline</span>
    <div class="header-actions">
      <span class="panel-badge">{timelineEvents.length}</span>
      <span class="toggle-label">{showTimeline ? "Hide" : "Show"}</span>
    </div>
  </button>
  {#if showTimeline}
    <div class="timeline-list">
      {#if timelineEvents.length === 0}
        <div class="empty-state compact">
          <div class="empty-title">Chưa có lượt chạy hoàn tất</div>
        </div>
      {:else}
        {#each timelineEvents as item}
          <div class={`timeline-item tone-${item.status}`}>
            <div class="timeline-top">
              <div class="timeline-title">
                <span class="timeline-tool">{item.tool}</span>
                <span class="timeline-status">{item.status}</span>
              </div>
              <span class="timeline-time">{item.durationMs} ms</span>
            </div>
            <div class="timeline-message">{item.message}</div>
            <div class="timeline-meta">
              <span>{item.timestamp}</span>
              {#if item.sessionId}
                <span class="timeline-session" title={item.sessionId}>{item.sessionId}</span>
              {/if}
              <span>{item.requestId}</span>
            </div>
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

  .timeline-panel {
    min-height: 64px;
    display: flex;
    flex-direction: column;
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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .panel-badge {
    min-width: 28px;
    height: 24px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: #1447e6;
    background: rgba(20, 71, 230, 0.08);
  }

  .toggle-label {
    font-size: 11px;
    color: #2563eb;
  }

  .timeline-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 14px 8px;
    overflow: auto;
  }

  .timeline-item {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-radius: 0;
    padding: 10px 2px;
    border: 0;
    border-bottom: 1px solid #edf2f7;
    background: transparent;
  }

  .timeline-item.tone-success {
    background: #f8fff9;
  }

  .timeline-item.tone-error {
    background: #fff8f8;
  }

  .timeline-item.tone-warn {
    background: #fffaf0;
  }

  .timeline-top,
  .timeline-title,
  .timeline-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .timeline-tool {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .timeline-status,
  .timeline-time,
  .timeline-meta {
    font-size: 11px;
    color: #64748b;
  }

  .timeline-message {
    font-size: 12px;
    line-height: 1.45;
    color: #1e293b;
  }

  .timeline-meta {
    justify-content: space-between;
  }

  .timeline-session {
    max-width: 120px;
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

  .empty-state.compact {
    min-height: 72px;
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

    .timeline-item {
      padding: 10px 2px;
    }

    .timeline-top,
    .timeline-title,
    .timeline-meta {
      align-items: flex-start;
    }

    .timeline-title,
    .timeline-meta {
      flex-direction: column;
    }

    .timeline-meta {
      gap: 4px;
    }
  }
</style>
