<script lang="ts">
  import type { ActiveRequest } from "../model";
  import { requestTone } from "../model";

  export let activeRequests: ActiveRequest[] = [];
  export let showHeader = true;
  export let compact = false;
</script>

<section class="panel activity-panel">
  {#if showHeader}
    <div class="panel-header">
      <span>Tool Activity</span>
      <span class="panel-badge">{activeRequests.length}</span>
    </div>
  {/if}
  <div class="activity-list">
    {#if activeRequests.length === 0}
      {#if compact}
        <div class="empty-inline">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span>Chưa có tool call nào</span>
      </div>
      {:else}
        <div class="empty-state">
          <div class="empty-title">Không có toolcall đang chạy</div>
          <div class="empty-copy">Khi một client gọi tool, tiến trình sẽ xuất hiện ở đây mà không làm giật layout.</div>
        </div>
      {/if}
    {:else}
      {#each activeRequests as request}
        <div class={`request-card ${requestTone(request)} ${compact ? "compact" : ""}`}>
          <div class="request-top">
            <div class="request-title">
              <span class="request-tool">{request.tool}</span>
              <span class="request-stage">{request.stage}</span>
            </div>
            <span class="request-progress">{request.progress}%</span>
          </div>
          {#if compact}
            <div class="request-message compact-message">{request.message}</div>
          {:else}
            <div class="request-message">{request.message}</div>
            <div class="request-id">{request.requestId}</div>
            <div class="progress-track">
              <div class="progress-fill" style={`width: ${Math.max(6, request.progress)}%`}></div>
            </div>
          {/if}
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

  .activity-panel {
    min-height: 0;
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

  .activity-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0 14px 8px;
    overflow: auto;
  }

  .request-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-radius: 0;
    padding: 10px 2px;
    border: 0;
    border-bottom: 1px solid #edf2f7;
    background: transparent;
  }

  .request-card.compact {
    padding: 8px 2px;
    gap: 4px;
  }

  .request-card.tone-working {
    background: #f8fbff;
  }

  .request-card.tone-success {
    background: #f8fff9;
  }

  .request-card.tone-error {
    background: #fff8f8;
  }

  .request-top,
  .request-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .request-tool {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .request-stage,
  .request-progress {
    font-size: 11px;
    color: #64748b;
  }

  .request-message {
    font-size: 12px;
    line-height: 1.45;
    color: #1e293b;
  }

  .compact-message {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 11px;
    color: #64748b;
  }

  .request-id {
    font-size: 10px;
    color: #94a3b8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-track {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(226, 232, 240, 0.9);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #0ea5e9, #2563eb 60%, #7c3aed);
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

  .empty-inline {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 24px 16px;
    color: #94a3b8;
    font-size: 11.5px;
    text-align: center;
  }

  .empty-inline svg {
    opacity: 0.5;
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
    .panel-header {
      padding: 12px 14px 8px;
      font-size: 11px;
    }

    .request-card {
      padding: 10px 2px;
    }

    .request-top {
      align-items: flex-start;
    }

    .request-title {
      flex-direction: column;
      align-items: flex-start;
    }

    .request-tool {
      font-size: 12px;
    }
  }
</style>
