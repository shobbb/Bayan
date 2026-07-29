import { describe, it, expect } from 'vitest';
import { sm2Scheduler, initialSrsState } from './scheduler';
import type { SrsState } from '@/domain/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000;

function state(overrides: Partial<SrsState> = {}): SrsState {
  return { dueAt: NOW, intervalDays: 10, ease: 2.5, reps: 3, lapses: 0, ...overrides };
}

describe('sm2 scheduler', () => {
  it('schedules a brand new card one day out on a passing grade', () => {
    const next = sm2Scheduler.next(null, 'good', NOW);

    expect(next.intervalDays).toBe(1);
    expect(next.dueAt).toBe(NOW + DAY);
    expect(next.reps).toBe(1);
    expect(next.lapses).toBe(0);
  });

  it('follows the 1 then 6 day ladder before easing takes over', () => {
    const first = sm2Scheduler.next(null, 'good', NOW);
    const second = sm2Scheduler.next(first, 'good', NOW);
    const third = sm2Scheduler.next(second, 'good', NOW);

    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(6);
    // Third repetition multiplies by the ease factor rather than the ladder.
    expect(third.intervalDays).toBe(Math.round(6 * second.ease));
  });

  it('raises ease for easy and lowers it for hard', () => {
    expect(sm2Scheduler.next(state(), 'easy', NOW).ease).toBeGreaterThan(2.5);
    expect(sm2Scheduler.next(state(), 'hard', NOW).ease).toBeLessThan(2.5);
    // "good" is the neutral grade in SM-2.
    expect(sm2Scheduler.next(state(), 'good', NOW).ease).toBeCloseTo(2.5, 10);
  });

  it('never lets ease fall below the 1.3 floor', () => {
    let current = state({ ease: 1.3 });
    for (let i = 0; i < 10; i++) current = sm2Scheduler.next(current, 'hard', NOW);

    expect(current.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('treats "again" as a lapse: interval resets, reps restart, lapses increment', () => {
    const next = sm2Scheduler.next(state({ reps: 5, lapses: 1, intervalDays: 40 }), 'again', NOW);

    expect(next.intervalDays).toBe(1);
    expect(next.reps).toBe(0);
    expect(next.lapses).toBe(2);
  });

  it('does not increment lapses on a passing grade', () => {
    expect(sm2Scheduler.next(state({ lapses: 2 }), 'hard', NOW).lapses).toBe(2);
  });

  it('grows intervals monotonically across a run of good grades', () => {
    let current = sm2Scheduler.next(null, 'good', NOW);
    const seen = [current.intervalDays];
    for (let i = 0; i < 5; i++) {
      current = sm2Scheduler.next(current, 'good', NOW);
      seen.push(current.intervalDays);
    }

    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
  });

  it('reports due only once the due time has passed', () => {
    const scheduled = sm2Scheduler.next(null, 'good', NOW);

    expect(sm2Scheduler.isDue(scheduled, NOW)).toBe(false);
    expect(sm2Scheduler.isDue(scheduled, scheduled.dueAt)).toBe(true);
    expect(sm2Scheduler.isDue(scheduled, scheduled.dueAt + 1)).toBe(true);
  });

  it('starts a fresh card due immediately and never drilled', () => {
    const fresh = initialSrsState(NOW);

    expect(fresh.reps).toBe(0);
    expect(fresh.intervalDays).toBe(0);
    expect(sm2Scheduler.isDue(fresh, NOW)).toBe(true);
  });
});
