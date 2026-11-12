// Small, optional touches for the lower half of the page. Everything here is progressive: without
// this file (or without JavaScript) the page shows the same content, still and settled.
(() => {
  'use strict';

  // 1. A short "Copied" on the Copy command / Copy checksum button that was used, next to where the
  // visitor is looking. app.js does the copying, announces the result in #release-feedback and
  // fires `hum:copied` on the button; this only mirrors a successful copy onto that button.
  let copiedTimer = 0;
  document.addEventListener('hum:copied', (event) => {
    const button = event.target;
    if (!(button instanceof Element) || !event.detail || event.detail.ok !== true) return;
    clearTimeout(copiedTimer);
    document.querySelectorAll('[data-copied]').forEach((other) => other.removeAttribute('data-copied'));
    button.setAttribute('data-copied', '');
    copiedTimer = setTimeout(() => button.removeAttribute('data-copied'), 2000);
  });

  const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still || typeof IntersectionObserver !== 'function') return;

  // 2. Motion plays a few times, once, when its part of the page comes into view: the dot on the
  // hands-free road and the terminal cursor. Without this they simply stay still.
  const inView = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('sx-inview');
      inView.unobserve(entry.target);
    }
  }, { threshold: 0.4 });
  document.querySelectorAll('.sx-road, .sx-terminal').forEach((element) => inView.observe(element));

  // 3. The footer bird flies in along the end of its path when it first comes into view.
  const footer = document.querySelector('.site-footer');
  const bird = footer && footer.querySelector('.sx-bird');
  if (bird) {
    footer.classList.add('sx-await');
    const landing = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      footer.classList.remove('sx-await');
      footer.classList.add('sx-arrived');
      landing.disconnect();
    }, { threshold: 0.6 });
    landing.observe(bird);
  }
})();
