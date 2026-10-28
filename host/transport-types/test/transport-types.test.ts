import { describe, expect, it } from 'bun:test';
import {
  CORE_RESERVED_IDS_COUNT,
  CORE_RESERVED_RANGE_END,
  CORE_RESERVED_RANGE_START,
  DEFAULT_MAX_DELTA_MS,
  DEFAULT_TARGET_FPS,
  GalfusLoopError,
  GalfusPolicyError,
  GalfusTransportError,
  U32_MAX,
  assertValidLogicalId,
  calculateFrameTiming,
  detectRuntime,
  isBrowserRuntime,
  isLogicalIdReserved,
  isNativeRuntime
} from '../src/index';

describe('@galfus/transport-types', () => {
  describe('Invariant Policies & Reserved ID Range', () => {
    it('should match the core specification constants', () => {
      expect(CORE_RESERVED_IDS_COUNT).toBe(65535);
      expect(CORE_RESERVED_RANGE_START).toBe(4294901761);
      expect(CORE_RESERVED_RANGE_END).toBe(4294967295);
      expect(U32_MAX).toBe(4294967295);
      expect(CORE_RESERVED_RANGE_END - CORE_RESERVED_RANGE_START + 1).toBe(CORE_RESERVED_IDS_COUNT);
    });

    it('should correctly classify safe host IDs as not reserved', () => {
      expect(isLogicalIdReserved(0)).toBe(false);
      expect(isLogicalIdReserved(1)).toBe(false);
      expect(isLogicalIdReserved(100)).toBe(false);
      expect(isLogicalIdReserved(1_000_000)).toBe(false);
      expect(isLogicalIdReserved(CORE_RESERVED_RANGE_START - 1)).toBe(false);
    });

    it('should correctly classify reserved range IDs as reserved', () => {
      expect(isLogicalIdReserved(CORE_RESERVED_RANGE_START)).toBe(true);
      expect(isLogicalIdReserved(CORE_RESERVED_RANGE_START + 1000)).toBe(true);
      expect(isLogicalIdReserved(CORE_RESERVED_RANGE_END)).toBe(true);
    });

    it('should accept valid host IDs with assertValidLogicalId', () => {
      expect(() => assertValidLogicalId(0, 'TextureId')).not.toThrow();
      expect(() => assertValidLogicalId(1, 'EntityId')).not.toThrow();
      expect(() => assertValidLogicalId(500, 'ModelId')).not.toThrow();
      expect(() => assertValidLogicalId(CORE_RESERVED_RANGE_START - 1, 'TargetId')).not.toThrow();
    });

    it('should reject non-integers and negative numbers', () => {
      expect(() => assertValidLogicalId(-1, 'EntityId')).toThrow(GalfusPolicyError);
      expect(() => assertValidLogicalId(3.14, 'EntityId')).toThrow(GalfusPolicyError);
      expect(() => assertValidLogicalId(NaN, 'EntityId')).toThrow(GalfusPolicyError);
    });

    it('should reject IDs exceeding u32::MAX', () => {
      expect(() => assertValidLogicalId(U32_MAX + 1, 'EntityId')).toThrow(GalfusPolicyError);
    });

    it('should reject IDs inside the core-reserved range and preserve invalidId', () => {
      try {
        assertValidLogicalId(CORE_RESERVED_RANGE_START, 'ModelId');
        expect.unreachable('Should have thrown GalfusPolicyError');
      } catch (err) {
        expect(err).toBeInstanceOf(GalfusPolicyError);
        const policyErr = err as GalfusPolicyError;
        expect(policyErr.invalidId).toBe(CORE_RESERVED_RANGE_START);
        expect(policyErr.message).toContain('violates core policy');
      }
    });
  });

  describe('Frame Timing & Loop Helpers', () => {
    it('should have standard default constants', () => {
      expect(DEFAULT_TARGET_FPS).toBe(120);
      expect(DEFAULT_MAX_DELTA_MS).toBe(100);
    });

    it('should calculate initial frame timing with zero delta', () => {
      const timing = calculateFrameTiming(100, 0, 1);
      expect(timing.timeMs).toBe(100);
      expect(timing.deltaMs).toBe(0);
      expect(timing.dt).toBe(0);
      expect(timing.frameId).toBe(1);
      expect(timing.fps).toBe(0);
    });

    it('should calculate normal frame timing correctly', () => {
      // 16.666 ms step (approx 60 fps)
      const timing = calculateFrameTiming(1000 + 16.6666, 1000, 2);
      expect(timing.timeMs).toBeCloseTo(1016.6666, 2);
      expect(timing.deltaMs).toBeCloseTo(16.6666, 2);
      expect(timing.dt).toBeCloseTo(0.01666, 3);
      expect(timing.fps).toBeCloseTo(60, 0);
      expect(timing.frameId).toBe(2);
    });

    it('should cap large deltas using maxDeltaMs to prevent spiral of death', () => {
      // 500 ms pause (e.g. window dragged)
      const timing = calculateFrameTiming(1500, 1000, 10, 100);
      expect(timing.deltaMs).toBe(100);
      expect(timing.dt).toBe(0.1);
      expect(timing.fps).toBe(10);
    });
  });

  describe('Runtime Environment Detection', () => {
    it('should identify the Bun runtime environment', () => {
      const info = detectRuntime();
      expect(info.runtime).toBe('bun');
      expect(info.version).toBeTruthy();
      expect(typeof info.version).toBe('string');
      expect(isNativeRuntime()).toBe(true);
      expect(isBrowserRuntime()).toBe(false);
    });
  });

  describe('Error Hierarchy', () => {
    it('should maintain correct prototypes and error names', () => {
      const transportErr = new GalfusTransportError('Base error');
      expect(transportErr).toBeInstanceOf(Error);
      expect(transportErr.name).toBe('GalfusTransportError');

      const policyErr = new GalfusPolicyError('Policy error', 4294901761);
      expect(policyErr).toBeInstanceOf(GalfusTransportError);
      expect(policyErr).toBeInstanceOf(Error);
      expect(policyErr.name).toBe('GalfusPolicyError');
      expect(policyErr.invalidId).toBe(4294901761);

      const loopErr = new GalfusLoopError('Loop already running');
      expect(loopErr).toBeInstanceOf(GalfusTransportError);
      expect(loopErr).toBeInstanceOf(Error);
      expect(loopErr.name).toBe('GalfusLoopError');
    });
  });
});
