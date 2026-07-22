import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import electron from 'electron'

const { safeStorage } = electron

type SecretDocument = Record<string, string>

export class SecretStore {
  constructor(private readonly filename: string) {}

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  get(key: string): string | undefined {
    const encrypted = this.readDocument()[key]
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return undefined
    }
  }

  set(key: string, value: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Keychain encryption chưa sẵn sàng trên máy này')
    }
    const document = this.readDocument()
    document[key] = safeStorage.encryptString(value).toString('base64')
    writeFileSync(this.filename, JSON.stringify(document), { encoding: 'utf8', mode: 0o600 })
  }

  private readDocument(): SecretDocument {
    if (!existsSync(this.filename)) return {}
    try {
      return JSON.parse(readFileSync(this.filename, 'utf8')) as SecretDocument
    } catch {
      return {}
    }
  }
}
