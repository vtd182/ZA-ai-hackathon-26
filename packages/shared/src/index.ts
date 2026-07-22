export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]))
  }
  return value
}

export function stableStringify(value: JsonValue): string {
  return JSON.stringify(sortJson(value))
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`)
}

