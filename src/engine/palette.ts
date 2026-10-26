import type { ParticipantId } from '../types';

export type RGB = [number, number, number];

/* The Babel — Cobalt Signal Collage. A: blue on white. B: white on blue. */
export const PAPER = '#f1eee6';
export const PAPER_RGB: RGB = [241, 238, 230];
export const INK: RGB = [16, 28, 92]; // deep navy
export const COBALT: RGB = [36, 64, 230];
export const COBALT_DEEP: RGB = [28, 48, 196];
export const ELECTRIC: RGB = [58, 110, 255];
export const SKY: RGB = [168, 194, 255];
export const LAVENDER: RGB = [158, 136, 228];
export const WHITE: RGB = [255, 255, 255];

/**
 * Participants differ in ground, ink and line language:
 *  A — blue on white: cobalt pen line, hatching, geometric marks (hollow circle ○)
 *  B — white on blue: white ribbon, light-blue highlights, halftone (filled square ■)
 * Each ink carries a thin "knockout" halo in the opposite colour so it stays legible on either ground.
 */
export const PALETTE: Record<ParticipantId, { ink: RGB; halo: RGB; accent: RGB; css: string; ground: string; style: string; marker: string }> = {
  A: { ink: COBALT_DEEP, halo: PAPER_RGB, accent: INK, css: '#1c30c4', ground: 'white', style: 'blue pen line', marker: '○' },
  B: { ink: WHITE, halo: COBALT, accent: SKY, css: '#2440e6', ground: 'blue', style: 'white ribbon', marker: '■' },
};

/** What is made together. */
export const SHARED: RGB = LAVENDER;

export const rgba = (c: RGB, a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;

export const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
