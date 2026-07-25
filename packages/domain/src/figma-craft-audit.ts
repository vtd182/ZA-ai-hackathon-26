import { z } from 'zod'

export const figmaCraftAuditIssueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['error', 'warning']),
  nodeId: z.string().min(1),
  message: z.string().min(1),
})

export const figmaCraftAuditSchema = z.object({
  schemaVersion: z.literal(1),
  rootNodeId: z.string().min(1),
  passed: z.boolean(),
  metrics: z.object({
    screenCount: z.number().int().nonnegative(),
    textCount: z.number().int().nonnegative(),
    visibleTextCount: z.number().int().nonnegative(),
    zdsInstanceCount: z.number().int().nonnegative(),
    prototypeLinkCount: z.number().int().nonnegative(),
    staleCopyCount: z.number().int().nonnegative(),
    forbiddenCopyCount: z.number().int().nonnegative(),
    clippedTextCount: z.number().int().nonnegative(),
    lowVisibilityTextCount: z.number().int().nonnegative(),
    visitedNodes: z.number().int().nonnegative(),
  }),
  issues: z.array(figmaCraftAuditIssueSchema),
}).superRefine((value, context) => {
  const hasError = value.issues.some((issue) => issue.severity === 'error')
  if (value.passed === hasError) {
    context.addIssue({
      code: 'custom',
      message: 'passed must be true exactly when the audit has no error issues',
      path: ['passed'],
    })
  }
})

export type FigmaCraftAudit = z.infer<typeof figmaCraftAuditSchema>
