import { TAIL_MIN_OBS } from '@/types/constants';

/**
 * The smallest sample count at which the engine shows each percentile. A percentile q is withheld
 * unless n × (1 − q) ≥ TAIL_MIN_OBS, so the floor is TAIL_MIN_OBS / (1 − q). The multiples are
 * written out because 1 − 0.99 is not exact in floating point.
 */
export const PERCENTILE_MIN_N = {
  p50: TAIL_MIN_OBS * 2,
  p95: TAIL_MIN_OBS * 20,
  p99: TAIL_MIN_OBS * 100,
} as const;
