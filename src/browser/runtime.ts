export class FixedClock {
 private debt = 0;
 advance(elapsedSeconds: number, tick: () => void | boolean): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid frame duration.');
  this.debt += elapsedSeconds;
  let count = 0;
  while (this.debt + 1e-10 >= 1 / 60 && count < 5) {
   if (tick() === false) break;
   this.debt -= 1 / 60; count++;
  }
  return count;
 }
 get pendingSeconds() { return this.debt; }
}

export class FrameMetrics {
 private samples: number[] = [];
 private slowInterval = 0;
 private longestSlowInterval = 0;
 record(milliseconds: number) {
  this.samples.push(milliseconds);
  this.slowInterval = milliseconds > 1000 / 30 ? this.slowInterval + milliseconds : 0;
  this.longestSlowInterval = Math.max(this.longestSlowInterval, this.slowInterval);
 }
 report() {
  const sorted = [...this.samples].sort((a, b) => a - b);
  return {
   frames: sorted.length,
   averageMs: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
   p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * .95) - 1] : 0,
   longestBelow30Seconds: this.longestSlowInterval / 1000,
  };
 }
}

export async function requestPhysicalDevice(): Promise<{ adapter: GPUAdapter; device: GPUDevice }> {
 if (!window.isSecureContext) throw new Error('A secure context is required. Open this game through HTTPS or localhost.');
 if (!navigator.gpu) throw new Error('WebGPU is unavailable. Use the specified Chromium browser with hardware acceleration.');
 const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
 if (!adapter || adapter.info.isFallbackAdapter || /swiftshader|llvmpipe|software|lavapipe/i.test(`${adapter.info.vendor} ${adapter.info.architecture} ${adapter.info.device} ${adapter.info.description}`)) {
  throw new Error('A physical WebGPU adapter is required. Software rendering cannot start the game.');
 }
 console.info('WebGPU physical adapter', { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description, limits: { maxTextureDimension2D: adapter.limits.maxTextureDimension2D, maxBindGroups: adapter.limits.maxBindGroups } });
 try {
  const device = await adapter.requestDevice({ requiredFeatures: [], requiredLimits: {} });
  return { adapter, device };
 } catch (error) { throw new Error(`WebGPU device initialization failed: ${error instanceof Error ? error.message : String(error)}`); }
}
