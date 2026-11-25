import type { DescSpec, FunctionSpec } from './types';

export const diagnosticsDescriptors: DescSpec[] = [
  {
    kind: 'enum',
    name: 'DiagnosticLogLevel',
    doc: 'Diagnostic log severity level.',
    values: ['trace', 'debug', 'info', 'warn', 'error']
  },
  {
    kind: 'object',
    name: 'DiagnosticsConfig',
    doc: 'Runtime configuration for the tagged diagnostics system.',
    fields: {
      enabledTags: {
        type: { array: 'string' },
        optional: true,
        doc: 'Optional list of tag names (e.g. ["gpu", "physics", "ffi", "memory"] or ["*"]).'
      },
      tagsMask: {
        type: 'number',
        optional: true,
        doc: 'Optional raw bitmask override (used when enabledTags is omitted).'
      },
      consoleOutput: {
        type: 'boolean',
        optional: true,
        doc: 'Forward tagged logs to the native logger.'
      },
      logLevel: {
        type: { ref: 'DiagnosticLogLevel' },
        optional: true,
        doc: 'Minimum log level to record.'
      }
    }
  },
  {
    kind: 'object',
    name: 'DiagnosticLogEntry',
    doc: 'A single tagged diagnostic log entry.',
    fields: {
      tsMs: { type: 'number', doc: 'Monotonic timestamp in milliseconds.' },
      tag: { type: 'string', doc: 'Canonical tag name.' },
      level: { type: { ref: 'DiagnosticLogLevel' }, doc: 'Log severity level.' },
      message: { type: 'string', doc: 'Log message text.' }
    }
  },
  {
    kind: 'object',
    name: 'CountersSnapshot',
    doc: 'Snapshot of global atomic engine diagnostic counters.',
    fields: {
      frameCount: { type: 'number' },
      ffiCstringAlloc: { type: 'number' },
      ffiCstringFree: { type: 'number' },
      ffiCstringLive: { type: 'number' },
      ffiCstringOutboundBytes: { type: 'number' },
      ffiInboundPayloadBytes: { type: 'number' },
      gpuSamplerCacheHit: { type: 'number' },
      gpuSamplerCacheMiss: { type: 'number' },
      gpuLayoutCacheHit: { type: 'number' },
      gpuLayoutCacheMiss: { type: 'number' },
      gpuPipelineCacheHit: { type: 'number' },
      gpuPipelineCacheMiss: { type: 'number' },
      gpuPipelineUncachedCreated: { type: 'number' },
      gpuBindGroupCascadeDestroyed: { type: 'number' },
      gpuArenaGrowCount: { type: 'number' },
      gpuAtlasRepackCount: { type: 'number' },
      realm3dPerFrameBindGroups: { type: 'number' },
      audioVoicesReaped: { type: 'number' },
      animationEventEvictions: { type: 'number' }
    }
  },
  {
    kind: 'object',
    name: 'SpanStats',
    doc: 'Rolling timing statistics for a named diagnostic span.',
    fields: {
      name: { type: 'string' },
      tag: { type: 'string' },
      count: { type: 'number' },
      lastUs: { type: 'number' },
      avgUs: { type: 'number' },
      p95Us: { type: 'number' },
      maxUs: { type: 'number' }
    }
  },
  {
    kind: 'object',
    name: 'MemoryCategoryStats',
    doc: 'Memory breakdown for a single engine subsystem category.',
    fields: {
      category: { type: 'string' },
      tag: { type: 'string' },
      cpuBytes: { type: 'number' },
      gpuBytes: { type: 'number' },
      reservedBytes: { type: 'number' },
      itemCount: { type: 'number' }
    }
  },
  {
    kind: 'object',
    name: 'MemoryBreakdown',
    doc: 'Aggregated CPU and GPU memory usage across categories.',
    fields: {
      totalCpuBytes: { type: 'number' },
      totalGpuBytes: { type: 'number' },
      totalReservedBytes: { type: 'number' },
      totalBytes: { type: 'number' },
      categories: { type: { array: { ref: 'MemoryCategoryStats' } } }
    }
  },
  {
    kind: 'object',
    name: 'DriftWarning',
    doc: 'Automatic leak or invariant drift warning.',
    fields: {
      category: { type: 'string' },
      metric: { type: 'string' },
      expected: { type: 'number' },
      actual: { type: 'number' },
      delta: { type: 'number' },
      message: { type: 'string' }
    }
  },
  {
    kind: 'object',
    name: 'DiagnosticsSnapshot',
    doc: 'Pull-on-demand snapshot of engine memory, counters, timings, drift warnings, and logs.',
    fields: {
      frameIndex: { type: 'number' },
      timestampMs: { type: 'number' },
      enabledTags: { type: { array: 'string' } },
      memory: { type: { ref: 'MemoryBreakdown' } },
      counters: { type: { ref: 'CountersSnapshot' } },
      timings: { type: { array: { ref: 'SpanStats' } } },
      driftWarnings: { type: { array: { ref: 'DriftWarning' } } },
      resources: { type: { inline: {} }, optional: true },
      recentLogs: { type: { array: { ref: 'DiagnosticLogEntry' } } }
    }
  }
];

export const diagnosticsFunctions: FunctionSpec[] = [
  {
    cName: 'galfus_diagnostics_configure',
    methodName: 'diagnosticsConfigure',
    doc: 'Configures tagged diagnostics from a DiagnosticsConfig descriptor.',
    params: [
      {
        name: 'config',
        type: { json: 'DiagnosticsConfig' },
        doc: 'Diagnostics configuration payload'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_diagnostics_set_tags',
    methodName: 'diagnosticsSetTags',
    doc: 'Sets the active diagnostic tag bitmask directly.',
    params: [
      {
        name: 'tagsMask',
        type: 'u64',
        doc: 'Bitmask of diagnostic tags to enable (0 disables all tags)'
      }
    ],
    returnType: 'i32'
  },
  {
    cName: 'galfus_diagnostics_snapshot',
    methodName: 'diagnosticsSnapshot',
    doc: 'Captures a pull-on-demand diagnostic snapshot (pass tagsMask = 0 for all recorded spans).',
    params: [
      {
        name: 'tagsMask',
        type: 'u64',
        doc: 'Optional tag bitmask filter for timing spans (0 includes all)'
      }
    ],
    returnType: { json: 'DiagnosticsSnapshot' }
  },
  {
    cName: 'galfus_diagnostics_drain_logs',
    methodName: 'diagnosticsDrainLogs',
    doc: 'Drains up to maxEntries tagged debug log entries from the ring buffer.',
    params: [
      {
        name: 'maxEntries',
        type: 'u32',
        doc: 'Maximum number of log entries to drain'
      }
    ],
    returnType: { jsonArray: 'DiagnosticLogEntry' }
  },
  {
    cName: 'galfus_diagnostics_reset',
    methodName: 'diagnosticsReset',
    doc: 'Resets diagnostic counters, timing windows, and log ring buffer while preserving enabled tags.',
    params: [],
    returnType: 'i32'
  }
];
