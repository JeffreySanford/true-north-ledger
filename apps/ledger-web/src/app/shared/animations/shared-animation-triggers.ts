import {
  animate,
  state,
  style,
  transition,
  trigger,
} from '@angular/animations';

export interface MotionTimings {
  routeDuration: string;
  cardDuration: string;
  highlightDuration: string;
  pulseDuration: string;
  expandDuration: string;
  collapseDuration: string;
}

export function prefersReducedMotion(win: Pick<Window, 'matchMedia'> | undefined = window): boolean {
  return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function createMotionTimings(win: Pick<Window, 'matchMedia'> | undefined = window): MotionTimings {
  if (prefersReducedMotion(win)) {
    return {
      routeDuration: '0ms',
      cardDuration: '0ms',
      highlightDuration: '0ms',
      pulseDuration: '0ms',
      expandDuration: '0ms',
      collapseDuration: '0ms',
    };
  }

  return {
    routeDuration: '220ms',
    cardDuration: '180ms',
    highlightDuration: '900ms',
    pulseDuration: '1200ms',
    expandDuration: '180ms',
    collapseDuration: '140ms',
  };
}

export const routeFadeSlide = trigger('routeFadeSlide', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(8px)' }),
    animate('{{routeDuration}} ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ], { params: { routeDuration: '220ms' } }),
]);

export const cardEnter = trigger('cardEnter', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(6px)' }),
    animate('{{cardDuration}} ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ], { params: { cardDuration: '180ms' } }),
]);

export const eventHighlight = trigger('eventHighlight', [
  transition('* => *', [
    style({ boxShadow: '0 0 0 0 rgba(14, 95, 147, 0.28)' }),
    animate('{{highlightDuration}} ease-out', style({ boxShadow: '0 0 0 0 rgba(14, 95, 147, 0)' })),
  ], { params: { highlightDuration: '900ms' } }),
]);

export const statusPulse = trigger('statusPulse', [
  state('active', style({ transform: 'scale(1)' })),
  transition('* => active', [
    animate('{{pulseDuration}} ease-out', style({ transform: 'scale(1)' })),
  ], { params: { pulseDuration: '1200ms' } }),
]);

export const expandCollapse = trigger('expandCollapse', [
  transition(':enter', [
    style({ height: 0, opacity: 0, overflow: 'hidden' }),
    animate('{{expandDuration}} ease-out', style({ height: '*', opacity: 1, overflow: 'hidden' })),
  ], { params: { expandDuration: '180ms' } }),
  transition(':leave', [
    style({ height: '*', opacity: 1, overflow: 'hidden' }),
    animate('{{collapseDuration}} ease-in', style({ height: 0, opacity: 0, overflow: 'hidden' })),
  ], { params: { collapseDuration: '140ms' } }),
]);

export const sharedAnimationTriggers = [
  routeFadeSlide,
  cardEnter,
  eventHighlight,
  statusPulse,
  expandCollapse,
];
