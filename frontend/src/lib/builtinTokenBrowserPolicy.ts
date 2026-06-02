/**
 * Production policy: vendor API secrets live on the server (SQLite + env), not in the browser.
 */
import { isClientSecretHydrationAllowed, mustUseApiGateway } from './platformTokenRuntime'

/** True only in local dev when explicit legacy hydration is enabled. */
export function shouldMirrorBuiltinSecretsInBrowser(): boolean {
  return !mustUseApiGateway() || isClientSecretHydrationAllowed()
}

/** Ignore localStorage overrides when the API gateway owns secrets. */
export function readBuiltinBrowserOverride(read: () => string): string {
  if (!shouldMirrorBuiltinSecretsInBrowser()) return ''
  return read()
}

/** Skip writing secrets to localStorage in gateway / production mode. */
export function persistBuiltinBrowserOverride(write: (value: string) => void, value: string): void {
  if (!shouldMirrorBuiltinSecretsInBrowser()) return
  write(value)
}

/** Ignore Vite build-time secret injection in production gateway mode. */
export function readBuiltinEnvFallback(envValue: string): string {
  if (mustUseApiGateway() && !isClientSecretHydrationAllowed()) return ''
  return envValue
}
