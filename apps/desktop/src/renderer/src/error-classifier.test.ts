import { describe, expect, it } from 'vitest'
import { classifyErrorText } from './error-classifier'

describe('classifyErrorText', () => {
  it('maps draft ProductSpec errors to the ProductSpec contract', () => {
    expect(classifyErrorText("Error invoking remote method 'lifecycle:prepare-artifacts': Error: ProductSpec vẫn là draft.").contract)
      .toBe('ProductSpec')
  })

  it('maps missing artifact brief errors to the ArtifactBrief contract', () => {
    const error = classifyErrorText('Approved design task has no immutable ArtifactBrief')
    expect(error.contract).toBe('ArtifactBrief')
    expect(error.nextAction).toContain('payload/hash')
  })

  it('maps Figma setup/preflight issues to the Figma MCP contract', () => {
    const error = classifyErrorText('Figma live free target chưa sẵn sàng: Figma plugin chưa kết nối.')
    expect(error.contract).toBe('Figma MCP')
    expect(error.nextAction).toContain('Figma setup')
  })

  it('maps craft QA failures to the Figma craft contract', () => {
    expect(classifyErrorText('Independent Figma craft QA vẫn còn lỗi sau 3 pass: missing CTA reaction').contract)
      .toBe('Figma craft')
  })

  it('maps read-back verification failures separately from write/runtime errors', () => {
    expect(classifyErrorText('Figma retry chưa verified. read-back thiếu artifact root.').contract)
      .toBe('Read-back verification')
  })

  it('maps provider errors with a checkpoint-oriented next action', () => {
    const error = classifyErrorText('AgentRouter lỗi 429: model is overloaded')
    expect(error.contract).toBe('Provider')
    expect(error.nextAction).toContain('checkpoint')
  })
})
