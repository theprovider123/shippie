/**
 * Tiny DOM animation helpers. Each fn applies the effect to a target
 * element using a single rAF-driven loop or CSS transitions. They are
 * defensive against missing DOM (return early) and respect
 * prefers-reduced-motion (skip).
 */
import { animateSpring } from '../spring.ts';
import type { VisualRecipe } from './types.ts';

function reduced(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function applyVisual(target: Element | null, recipe: VisualRecipe): void {
  if (!target || reduced()) return;
  const el = target as HTMLElement;
  switch (recipe.kind) {
    case 'scale-spring':
      scaleSpring(el);
      break;
    case 'pop':
      pop(el);
      break;
    case 'shake':
      shake(el, recipe.durationMs);
      break;
    case 'glow':
      glow(el, recipe);
      break;
    case 'fade-out':
      fadeOut(el, recipe.durationMs);
      break;
    case 'lift-float':
      liftFloat(el, recipe.durationMs);
      break;
    case 'slide':
      slide(el);
      break;
  }
  if (recipe.particles) particleBurst(el, recipe.particles);
  if (recipe.glow && recipe.kind !== 'glow') glow(el, recipe);
  if (recipe.flash) flash(recipe.flash);
}

/**
 * Full-viewport overlay that fades in to `opacity` then fades out across
 * `durationMs`. Used by the install signature moment to wash the whole page
 * sunset orange. No-op when no document or under reduced-motion.
 */
function flash(spec: NonNullable<VisualRecipe['flash']>): void {
  if (typeof document === 'undefined' || reduced()) return;
  const layer = document.createElement('div');
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    `background:${spec.color}`,
    'opacity:0',
    'pointer-events:none',
    'z-index:2147483647',
    `transition:opacity ${spec.durationMs / 2}ms ease-out`,
  ].join(';');
  document.body.appendChild(layer);
  requestAnimationFrame(() => {
    layer.style.opacity = String(spec.opacity);
    setTimeout(() => {
      layer.style.opacity = '0';
      setTimeout(() => layer.remove(), spec.durationMs / 2 + 50);
    }, spec.durationMs / 2);
  });
}

function scaleSpring(el: HTMLElement): void {
  animateSpring(({ value }) => {
    el.style.transform = `scale(${value})`;
  }, { from: 0.97, to: 1, stiffness: 240, damping: 18 });
}

function pop(el: HTMLElement): void {
  animateSpring(({ value }) => {
    el.style.transform = `scale(${value})`;
  }, { from: 1.08, to: 1, stiffness: 320, damping: 16 });
}

function shake(el: HTMLElement, durationMs: number): void {
  if (typeof requestAnimationFrame !== 'function') return;
  const original = el.style.transform;
  const start = performance.now();
  const offsetPx = 6;
  const tick = () => {
    const t = (performance.now() - start) / durationMs;
    if (t >= 1) {
      el.style.transform = original;
      return;
    }
    const dx = Math.sin(t * Math.PI * 6) * offsetPx * (1 - t);
    el.style.transform = `translateX(${dx}px) ${original}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function glow(el: HTMLElement, recipe: VisualRecipe): void {
  const g = recipe.glow;
  if (!g) return;
  const original = el.style.boxShadow;
  el.style.transition = `box-shadow ${g.durationMs}ms ease-out`;
  el.style.boxShadow = `0 0 24px ${g.color}`;
  setTimeout(() => {
    el.style.boxShadow = original;
  }, g.durationMs);
}

function fadeOut(el: HTMLElement, durationMs: number): void {
  el.style.transition = `opacity ${durationMs}ms ease-out`;
  el.style.opacity = '0';
}

function liftFloat(el: HTMLElement, durationMs: number): void {
  if (typeof requestAnimationFrame !== 'function') return;
  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const y = -8 * Math.sin(t * Math.PI);
    el.style.transform = `translateY(${y}px) scale(${1 + t * 0.06})`;
    if (t < 1) requestAnimationFrame(tick);
    else el.style.transform = '';
  };
  requestAnimationFrame(tick);
}

function slide(el: HTMLElement): void {
  animateSpring(({ value }) => {
    el.style.transform = `translateX(${(1 - value) * 16}px)`;
    el.style.opacity = String(0.6 + 0.4 * value);
  }, { from: 0, to: 1, stiffness: 200, damping: 22 });
}

function particleBurst(el: HTMLElement, p: NonNullable<VisualRecipe['particles']>): void {
  if (typeof document === 'undefined') return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647';
  document.body.appendChild(layer);
  for (let i = 0; i < p.count; i++) {
    const angle = (i / p.count) * Math.PI * 2;
    const dx = Math.cos(angle) * p.radiusPx;
    const dy = Math.sin(angle) * p.radiusPx;
    const dot = document.createElement('div');
    const color = p.colors[i % p.colors.length] ?? '#ffffff';
    dot.style.cssText = `position:absolute;left:${cx}px;top:${cy}px;width:6px;height:6px;border-radius:50%;background:${color};transform:translate(-50%,-50%);transition:transform ${p.durationMs}ms ease-out, opacity ${p.durationMs}ms ease-out`;
    layer.appendChild(dot);
    requestAnimationFrame(() => {
      dot.style.transform = `translate(${dx - 3}px, ${dy - 3}px)`;
      dot.style.opacity = '0';
    });
  }
  setTimeout(() => layer.remove(), p.durationMs + 50);
}
