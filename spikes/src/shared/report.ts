// Environment info and JSON report download, so spike results can be recorded in docs/spikes/.

export async function environmentInfo() {
  let gpu: Record<string, unknown> | string = "webgpu unavailable";
  if ("gpu" in navigator && navigator.gpu) {
    const adapter = await navigator.gpu.requestAdapter();
    gpu = adapter
      ? {
          vendor: adapter.info.vendor,
          architecture: adapter.info.architecture,
          description: adapter.info.description,
        }
      : "no adapter";
  }
  return {
    date: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    crossOriginIsolated: self.crossOriginIsolated,
    gpu,
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
