export type AppErrorContract =
  | 'ProductSpec'
  | 'ArtifactBrief'
  | 'Figma MCP'
  | 'Figma craft'
  | 'Read-back verification'
  | 'Provider'
  | 'Canvas'
  | 'Runtime'

export interface ClassifiedAppError {
  contract: AppErrorContract
  title: string
  detail: string
  nextAction: string
}

function cleanRemoteError(value: string): string {
  return value
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '')
    .trim()
}

export function classifyErrorText(value: string): ClassifiedAppError {
  const detail = cleanRemoteError(value)
  if (/ProductSpec|ProductBrief|chốt ProductSpec|source of truth|scope để tạo|requirement|Dangling entity|Duplicate entity/i.test(detail)) {
    return {
      contract: 'ProductSpec',
      title: 'ProductSpec chưa sẵn sàng',
      detail,
      nextAction: 'Mở ProductSpec preview, chốt lại scope hoặc dùng /spec confirm trước khi tạo artifact.',
    }
  }
  if (/ArtifactBrief|artifact brief|sourcePayloadHash|output policy|designSystemPolicy|guardMode/i.test(detail)) {
    return {
      contract: 'ArtifactBrief',
      title: 'ArtifactBrief không hợp lệ',
      detail,
      nextAction: 'Chuẩn bị lại artifact để Agent Core tạo payload/hash mới từ ProductSpec hiện tại.',
    }
  }
  if (/Figma MCP|Figma plugin|plugin chưa|runtime|allowlist|target|Page|session|Không dùng ZDS|ZDS|MISSING_COMPONENT_ROLE|MANIFEST_CHANGED|TARGET_NOT_ALLOWED/i.test(detail)) {
    return {
      contract: 'Figma MCP',
      title: 'Figma target hoặc guard chưa ổn',
      detail,
      nextAction: 'Mở Figma setup, kiểm tra plugin/session/Page allowlist rồi prepare hoặc retry lại Figma.',
    }
  }
  if (/craft worker|Design worker|visual QA|screenshot|audit_product_craft|Codex design|Figma craft/i.test(detail)) {
    return {
      contract: 'Figma craft',
      title: 'Design craft chưa qua QA',
      detail,
      nextAction: 'Retry Figma hoặc dùng /figma refine với feedback cụ thể; scaffold/receipt vẫn được giữ để sửa tiếp.',
    }
  }
  if (/read-back|read back|verify|verification|postflight|receipt|artifact root|idempotency/i.test(detail)) {
    return {
      contract: 'Read-back verification',
      title: 'Write chưa được xác minh',
      detail,
      nextAction: 'Không coi artifact đã done. Dùng retry trên target lỗi để đọc lại hoặc ghi lại đúng payload đã duyệt.',
    }
  }
  if (/Provider|AgentRouter|Codex|OpenAI|Gemini|Anthropic|API key|model|reasoning|timeout|không phản hồi|turn/i.test(detail)) {
    return {
      contract: 'Provider',
      title: 'Provider reasoning bị gián đoạn',
      detail,
      nextAction: 'Kiểm tra provider/model/API key hoặc đổi provider tại checkpoint; ProductSpec/canvas local vẫn được giữ.',
    }
  }
  if (/Canvas|canvas|shape|node|operation|visual verification|script/i.test(detail)) {
    return {
      contract: 'Canvas',
      title: 'Canvas update chưa verified',
      detail,
      nextAction: 'Sync lại canvas hoặc chọn vùng nhỏ hơn rồi yêu cầu sửa; ProductSpec chưa đổi nếu chưa promote/confirm.',
    }
  }
  return {
    contract: 'Runtime',
    title: 'Runtime cần xử lý',
    detail,
    nextAction: 'Đọc detail bên dưới, sửa bước gây lỗi rồi chạy lại action tương ứng.',
  }
}
