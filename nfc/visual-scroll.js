/* Decorative scroll layer, independent of NFC tracking and navigation. */
(() => {
  'use strict';
  const scenes = [...document.querySelectorAll('[data-scene]')];
  const frames = scenes.map(scene => scene.querySelector('.scene-art'));
  if (!scenes.length || frames.some(frame => !frame) || !window.matchMedia) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'passage-visuals';
  layer.setAttribute('aria-hidden', 'true');
  let enabled = false;
  let pending = 0;
  let positions = [];
  const loaded = frame => frame.firstElementChild.complete && frame.firstElementChild.naturalWidth > 0;
  function paint() {
    pending = 0;
    if (!enabled) return;
    const y = window.scrollY;
    let current = 0;
    while (current < positions.length - 1 && y >= positions[current + 1]) current++;
    const span = (positions[current + 1] || document.documentElement.scrollHeight) - positions[current];
    const progress = Math.max(0, Math.min(1, (y - positions[current]) / Math.max(1, span)));
    const next = Math.min(current + 1, frames.length - 1);
    const blend = next !== current && loaded(frames[next]) ? Math.max(0, Math.min(1, (progress - .55) / .45)) : 0;
    let available = current;
    while (available > 0 && !loaded(frames[available])) available--;
    frames.forEach((frame, index) => {
      const alpha = index === available ? 1 - blend : index === next ? blend : 0;
      frame.style.opacity = String(alpha);
      // Zoom remains below 1 so the illustration is never cropped.
      frame.style.transform = `scale(${index === available ? .97 + progress * .03 : .97})`;
    });
  }
  function schedule() {
    if (enabled && !pending) pending = requestAnimationFrame(paint);
  }
  function measure() {
    positions = scenes.map(scene => scene.getBoundingClientRect().top + window.scrollY);
    schedule();
  }
  function configure() {
    const shouldEnable = !reduced.matches && loaded(frames[0]);
    if (shouldEnable === enabled) return;
    enabled = shouldEnable;
    if (enabled) {
      frames.forEach(frame => layer.append(frame));
      document.body.prepend(layer);
      document.documentElement.classList.add('visual-scroll');
      measure();
    } else {
      cancelAnimationFrame(pending); pending = 0;
      frames.forEach((frame, index) => {
        frame.removeAttribute('style'); scenes[index].prepend(frame);
      });
      layer.remove();
      document.documentElement.classList.remove('visual-scroll');
    }
  }
  frames.forEach(frame => frame.firstElementChild.addEventListener('load', () => { configure(); schedule(); }));
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  window.addEventListener('pageshow', measure);
  reduced.addEventListener('change', configure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(document.querySelector('main'));
  configure();
})();
