const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i

export function extractUuid(text: string): string | null {
  const m = text.trim().match(UUID_RE)
  return m ? m[0].toLowerCase() : null
}

export function resolveSentinelHubInstanceId(
  config: Record<string, string>,
  name = '',
  notes = '',
): string {
  const fromConfig = (config.instanceId ?? '').trim()
  if (fromConfig) return fromConfig
  return extractUuid(name) || extractUuid(notes) || ''
}
