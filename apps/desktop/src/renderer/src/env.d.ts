import type { DesktopApi } from '@pm-agent/domain'

declare global {
  interface Window {
    pmAgent: DesktopApi
  }
}

export {}

