import type { PluginToolRequest, PluginToolResponse } from "./protocol";
import { handleWriteCreateRequest } from "../write-create";
import { handleWriteModifyRequest } from "../write-modify";
import { handleWriteVectorRequest } from "../write-vector";
import { handleWriteStyleRequest } from "../write-styles";
import { handleWriteVariableRequest } from "../write-variables";
import { handleWriteComponentRequest } from "../write-components";
import { handleWritePrototypeRequest } from "../write-prototype";
import { handleWritePageRequest } from "../write-page";

export const handleWriteRequest = async (
  request: PluginToolRequest,
): Promise<PluginToolResponse | null> =>
  (await handleWriteCreateRequest(request)) ??
  (await handleWriteModifyRequest(request)) ??
  (await handleWriteVectorRequest(request)) ??
  (await handleWriteStyleRequest(request)) ??
  (await handleWriteVariableRequest(request)) ??
  (await handleWriteComponentRequest(request)) ??
  (await handleWritePrototypeRequest(request)) ??
  (await handleWritePageRequest(request));
