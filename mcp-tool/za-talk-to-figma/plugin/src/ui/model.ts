export type ActiveRequest = {
  requestId: string;
  tool: string;
  stage: string;
  progress: number;
  message: string;
  startedAt: number;
  lastDebugMessage: string;
  lastDebugProgress: number;
};

export type DebugEvent = {
  id: string;
  tone: "info" | "success" | "warn" | "error";
  tool: string;
  stage: string;
  requestId?: string;
  message: string;
  timestamp: string;
};

export type TimelineEvent = {
  id: string;
  tool: string;
  requestId: string;
  status: "success" | "warn" | "error";
  message: string;
  durationMs: number;
  timestamp: string;
  sessionId?: string;
};

export type SessionSummary = {
  sessionId: string;
  fileName: string;
  pageName: string;
  selectionCount?: number;
};

export function requestTone(request: ActiveRequest): string {
  if (request.stage === "error") return "tone-error";
  if (request.stage === "done") return "tone-success";
  if (request.stage === "progress") return "tone-working";
  return "tone-idle";
}
