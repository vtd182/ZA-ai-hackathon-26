export function assertProviderTurnAvailable(
  activeThreadIds: Iterable<string>,
  requestedThreadId: string,
): void {
  const activeThreadId = activeThreadIds[Symbol.iterator]().next().value as string | undefined
  if (!activeThreadId) return
  if (activeThreadId === requestedThreadId) throw new Error('Thread này đang có một turn chạy')
  throw new Error('Một thread khác đang reasoning. Hãy chờ hoặc dừng turn đó trước khi gửi tiếp.')
}
