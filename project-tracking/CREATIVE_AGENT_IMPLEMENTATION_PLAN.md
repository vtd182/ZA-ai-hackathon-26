# Creative Agent Implementation Plan

## Objective

Turn chat, tldraw and the existing lifecycle core into one reviewable co-creation loop:

```text
natural conversation
  -> optional typed canvas proposal
  -> guarded tldraw scene apply
  -> checkpoint + visual read-back
  -> user edit/selection
  -> typed CanvasDiff sync
  -> agent response grounded in the changed scene
  -> explicit ProductSpec promotion
  -> guarded Figma artifact generation
```

The happy path is the release target. Advanced arbitrary scripts, production collaboration and exhaustive visual test matrices are not part of this slice.

## Architecture

### 1. Conversation response

- Keep provider-native adapters and normalized events.
- Treat lifecycle phase as input context, not the creative output itself.
- Every lightweight response includes a typed semantic intent. Application regex does not infer Vietnamese natural-language actions.
- Natural `draw/edit` uses a lightweight route response followed by a rich creative response; explicit canvas slash commands skip the route response.
- Preserve the current phase data for compatibility with the existing guided panels.
- Separate assistant prose from canvas work: `message` explains the thinking; `canvasProgram` is an optional proposal.
- Ordinary chat returns `mode: none`. Explicit visual requests and selected-canvas edits may return scene work.

### 2. Canvas Scene Program

- Extend the current backwards-compatible Canvas Program with scene metadata and rich semantic nodes.
- Workflow nodes carry title, description, badge, lane, icon and tone.
- Prototype screens carry authored sections, values, states, actions and navigation.
- Connections remain stable-ID semantic edges.
- The renderer owns safe tldraw primitives, grouping, coordinates, collision avoidance, camera and undo.
- The provider owns content, hierarchy and art direction.
- Existing operation/script programs remain valid for the developer bridge.

### 3. Execution policy

- The provider decides what the user means; the application decides whether that typed intent is allowed to mutate state.
- Explicit draw/edit requests may execute provider proposals automatically as one local undoable transaction.
- An edit still requires an explicit selection or a uniquely resolved semantic target.
- Provider output is not compared to a deterministic template and is never replaced for having different labels.
- Deterministic planning runs only when the selected provider returns no usable visual proposal.
- ProductSpec and external artifacts still require their existing explicit preview/approval boundaries.

### 4. Bidirectional context

- Inspect semantic scene hierarchy, authored content, parent relation, style role and bindings.
- Keep one bounded synced baseline per active canvas.
- Sync computes created, updated, moved and deleted shape IDs plus the selected region.
- The typed diff is sent alongside the current snapshot; it is not inferred from a synthetic sentence.
- The assistant describes what changed and asks or executes the next requested local canvas action.

## Implementation Sequence

1. **Domain contract**
   - Add rich node/screen fields and CanvasDiff.
   - Keep v1 persisted programs readable.
   - Update provider JSON schema without `oneOf`.

2. **Provider path**
   - Rewrite the canvas policy around authored scenes.
   - Enrich bounded canvas/selection context.
   - Make the Mock provider use the same rich fallback programs.
   - Remove template completeness replacement from main orchestration.

3. **Renderer**
   - Render workflow cards with hierarchy, lanes and visual roles.
   - Render screen frames from provider-authored blocks.
   - Add scene title/context furniture generated from program metadata.
   - Keep old simple nodes as compatibility fallback.

4. **Sync**
   - Track the last synced canvas context.
   - Compute a bounded diff on Sync.
   - Pass the diff through typed IPC and provider prompt.
   - Show sync state without shifting the canvas or chat layout.

5. **Demo verification**
   - Use reminder backup as the primary creative scenario.
   - Verify normal chat leaves canvas empty.
   - Verify flow, manual edit/selection, Sync and prototype in one thread.
   - Run root typecheck, focused tests, build and one production Electron smoke.
   - Review desktop screenshot for overlap, readability and chat/canvas state.

## Demo Script

1. Create a new thread and enter: `Tôi muốn làm Mini App nhắc người dùng backup dữ liệu đúng hạn.`
2. Discuss the goal; canvas stays empty.
3. Enter: `Vẽ user flow MVP, gồm thiết lập lịch, nhắc đúng hạn, backup ngay, hoãn và thử lại khi lỗi.`
4. Select the reminder decision, add or move a note, then press Sync.
5. Ask: `Dựa trên phần tôi vừa sửa, làm rõ nhánh hoãn và quay lại lịch nhắc.`
6. Enter: `Tạo prototype các màn hình chính để tôi review trải nghiệm.`
7. Review distinct editable screens, then continue with the existing ProductSpec/Figma approval flow.

## Done Evidence

- Rich normalization, provider-first execution, lightweight conversation schemas and CanvasDiff are covered by focused tests.
- Root `./run.sh typecheck`, `./run.sh test` (124 pass + 1 optional skip) and `./run.sh build` pass.
- `./run.sh smoke-lifecycle` verifies detailed prototype, manual change, selection and Sync while preserving ProductSpec.
- `./run.sh smoke-flow` verifies the complete deterministic rehearsal path.
- `./run.sh smoke-codex-canvas` verifies a real provider-authored 20-node scene, selected feedback, durable receipts, ProductSpec promotion, developer scene apply and verified artifacts.
- Reviewed screenshots show readable workflow/prototype scenes with content-aware geometry and no old-scene stacking.
- Rich Codex canvas turns remain latency-sensitive, so the deterministic Mock/Offline provider is the rehearsal fallback.
