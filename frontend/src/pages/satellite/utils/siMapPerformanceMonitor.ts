/** Performance monitor removed — no-op stubs keep call sites stable. */

export function setSiMapPerformanceMonitorEnabled(_on: boolean): void {}

export function isSiMapPerformanceMonitorEnabled(): boolean {
  return false;
}

export function recordSiMapSlowOperation(_name: string, _startedAt: number): void {}

export function measureSiMapOperation<T>(_name: string, fn: () => T): T {
  return fn();
}

export async function measureSiMapOperationAsync<T>(
  _name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}

export function recordSiMapNetworkLatency(_ms: number): void {}

export function readSiMapPerformanceSnapshot() {
  return {
    fps: 0,
    frameMs: 0,
    memoryMb: null,
    slowOpsLastMinute: 0,
    blockingOpsLastMinute: 0,
    networkLatencyMs: null,
  };
}

export function startSiMapPerformanceMonitor(_map?: unknown): void {}

export function stopSiMapPerformanceMonitor(): void {}

export function installSiMapNetworkLatencyProbe(): void {}
