/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import {
  createMotionTimings,
  sharedAnimationTriggers,
} from './shared-animation-triggers';

describe('shared animation triggers', () => {
  it('exports all required shared trigger names', () => {
    const triggerNames = sharedAnimationTriggers.map((trigger) => trigger.name);
    expect(triggerNames).toEqual([
      'routeFadeSlide',
      'cardEnter',
      'eventHighlight',
      'statusPulse',
      'expandCollapse',
    ]);
  });

  it('returns zero-duration timings when reduced motion is preferred', () => {
    const fakeWindow = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;

    const timings = createMotionTimings(fakeWindow);
    expect(timings).toEqual({
      routeDuration: '0ms',
      cardDuration: '0ms',
      highlightDuration: '0ms',
      pulseDuration: '0ms',
      expandDuration: '0ms',
      collapseDuration: '0ms',
    });
  });

  it('returns default timings when reduced motion is not preferred', () => {
    const fakeWindow = {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as unknown as Window;

    const timings = createMotionTimings(fakeWindow);
    expect(timings).toMatchObject({
      routeDuration: '220ms',
      cardDuration: '180ms',
      highlightDuration: '900ms',
      pulseDuration: '1200ms',
      expandDuration: '180ms',
      collapseDuration: '140ms',
    });
  });
});
