import { describe, expect, it } from 'vitest'
import { mealOrderingProductSpec } from '@pm-agent/fixture-meal-ordering'
import { renderProductSpecMarkdown } from './markdown-document'

describe('ProductSpec Markdown artifact', () => {
  it('renders requirements, decisions and traceability without losing stable IDs', () => {
    const markdown = renderProductSpecMarkdown(mealOrderingProductSpec)

    expect(markdown).toContain('# Mini App đặt suất ăn trước')
    expect(markdown).toContain('REQ-ORDER · Đặt suất ăn')
    expect(markdown).toContain('| REQ-PAYMENT | SCREEN-CHECKOUT, SCREEN-WALLET-ERROR | STORY-PAY-WALLET |')
    expect(markdown).toContain('DECISION')
    expect(markdown).toContain('Document: this Markdown file')
  })
})
