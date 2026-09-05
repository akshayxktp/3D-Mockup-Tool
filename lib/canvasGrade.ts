// The Adjustments group (Brightness / Contrast / Saturation / Grayscale) grades
// the device as a CSS filter on the <canvas> element itself, which means it is
// applied by the compositor and never touches the pixels in the backing store.
// Anything that READS those pixels — the image export — therefore has to replay
// the same grade itself. Canvas2D's `ctx.filter` takes the same syntax as the
// CSS property, so both sides can share one string builder and stay in step.

export function gradeFilter(p: Record<string, any>, has: (k: string) => boolean): string {
  const num = (k: string, d: number) => Number(p[k] ?? d);
  const parts: string[] = [];
  const bright = num('brightness', 100);
  const contrast = num('contrast', 100);
  const sat = num('saturation', 100);
  const gray = num('grayscale', 0);
  if (has('brightness') && bright !== 100) parts.push(`brightness(${bright}%)`);
  if (has('contrast') && contrast !== 100) parts.push(`contrast(${contrast}%)`);
  if (has('saturation') && sat !== 100) parts.push(`saturate(${sat}%)`);
  if (has('grayscale') && gray > 0) parts.push(`grayscale(${gray}%)`);
  return parts.join(' ');
}
