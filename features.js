// Hum tester page, designer A: two small, decorative motions. Without JavaScript, without
// IntersectionObserver, or with reduced motion, nothing here moves and the page is complete.
(() => {
  'use strict';
  const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  if (!('IntersectionObserver' in window) || (motion && motion.matches)) return;

  // 1. The feature cards' small motions (a blinking caret, a voice wave, a recording dot)
  //    run a few times while their card is in view, then rest. CSS keys them on .is-live.
  const cards = document.querySelectorAll('.ft-vig');
  if (cards.length) {
    const live = new IntersectionObserver((entries) => {
      entries.forEach((item) => item.target.classList.toggle('is-live', item.isIntersecting));
    }, { threshold: 0.35 });
    cards.forEach((card) => live.observe(card));
    if (motion && motion.addEventListener) {
      motion.addEventListener('change', (event) => {
        if (!event.matches) return;
        live.disconnect();
        cards.forEach((card) => card.classList.remove('is-live'));
      });
    }
  }

  // 2. The hummingbird's flight along the three phrases. The markup is already the finished
  //    picture (every phrase written, the bird at the end); this replays the flight once,
  //    as soon as a little of the band is in view, so the start state is never left showing.
  const band = document.querySelector('.ft-flight');
  if (!band) return;
  const art = band.querySelector('.ft-flight-art');
  const path = band.querySelector('#ft-flight-path');
  const entry = band.querySelector('#ft-flight-entry');
  const loop = band.querySelector('#ft-flight-loop');
  const reveal = band.querySelector('.ft-reveal-path');
  const bird = band.querySelector('.ft-bird-mover');
  if (!art || !path || !entry || !loop || !reveal || !bird || typeof path.getTotalLength !== 'function') return;

  let total;
  let loopStart;
  let loopEnd;
  try {
    total = path.getTotalLength();
    loopStart = entry.getTotalLength();
    loopEnd = loopStart + loop.getTotalLength();
  } catch (error) {
    return;
  }
  if (!(total > 0 && loopEnd < total)) return;

  const place = (distance) => {
    const point = path.getPointAtLength(distance);
    bird.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);
    reveal.style.strokeDasharray = `${total} ${total}`;
    reveal.style.strokeDashoffset = String(total - distance);
  };
  const finish = () => {
    place(total);
    band.classList.remove('is-flying');
  };

  // A hummingbird's rhythm: arrive, hover through the loop, pause, then dart across.
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const hover = (t) => (1 - Math.cos(Math.PI * t)) / 2;
  const dart = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const phases = [[0, loopStart, 1500, easeOut], [loopStart, loopEnd, 1350, hover], [loopEnd, total, 2100, dart]];

  let frame = 0;
  let timer = 0;
  let started = false;
  // Each step asks for the next animation frame, with a slow timer as a fallback for
  // environments that stop delivering frames; whichever comes first runs.
  const next = (callback) => {
    const run = () => { cancelAnimationFrame(frame); clearTimeout(timer); callback(); };
    frame = requestAnimationFrame(run);
    timer = setTimeout(run, 120);
  };
  const fly = () => {
    started = true;
    place(0);
    band.classList.add('is-flying');
    let phase = 0;
    let begin = performance.now();
    const step = () => {
      const now = performance.now();
      const [from, to, duration, ease] = phases[phase];
      const t = Math.min(1, Math.max(0, (now - begin) / duration));
      place(from + (to - from) * ease(t));
      if (t < 1) { next(step); return; }
      phase += 1;
      begin = now;
      if (phase < phases.length) { next(step); return; }
      finish();
    };
    next(step);
  };

  // One observer sets up and starts the flight together, with a low threshold so a band
  // that only peeks above the fold already plays (and is never left half-drawn).
  const observer = new IntersectionObserver((entries) => {
    if (started || !entries.some((item) => item.isIntersecting)) return;
    observer.disconnect();
    fly();
  }, { threshold: 0.15 });
  observer.observe(art);

  if (motion && motion.addEventListener) {
    motion.addEventListener('change', (event) => {
      if (!event.matches) return;
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      started = true;
      finish();
    });
  }
})();
