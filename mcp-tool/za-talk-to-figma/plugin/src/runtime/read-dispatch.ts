import type { PluginToolRequest, PluginToolResponse } from "./protocol";
import { handleReadDocumentRequest } from "../read-document";
import { handleReadStyleRequest } from "../read-styles";
import { handleReadExportRequest } from "../read-export";
import { handleLifecycleArtifactRequest } from "../lifecycle-artifact";
import { handleProductCraftAuditRequest } from "../product-craft-audit";

export const handleReadRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> =>
  (await handleReadDocumentRequest(request)) ??
  (await handleReadStyleRequest(request)) ??
  (await handleReadExportRequest(request)) ??
  (await handleLifecycleArtifactRequest(request)) ??
  (await handleProductCraftAuditRequest(request));
