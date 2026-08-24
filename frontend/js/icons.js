// Small, consistent line-icon set (24x24, stroke-based, currentColor) used
// everywhere the app needs a functional icon — notifications, likes,
// comments, saved state, badges, and status indicators. Kept as plain
// inline SVG strings (no icon font, no external library) so there's zero
// extra network dependency and the icons always render identically.
//
// Usage: Icons.bell(), Icons.heart({ filled: true }), etc. Each returns a
// ready-to-insert SVG markup string sized by the caller's CSS (width/height
// default to 1em so icons scale with font-size).

// Escapes a string for safe insertion into innerHTML. Used anywhere
// user-controlled content (display names, item names, comments, report
// reasons, etc.) is interpolated into an HTML template literal rather than
// set via textContent — without this, a display name like
// `<img src=x onerror=alert(1)>` would execute as script for anyone who
// views it in a notification, the leaderboard, a comment, or a guide.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

const Icons = (() => {
  function svg(pathContent, { viewBox = "0 0 24 24" } = {}) {
    return `<svg class="icon" viewBox="${viewBox}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pathContent}</svg>`;
  }

  return {
    bell: () =>
      svg('<path d="M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),

    heart: ({ filled = false } = {}) =>
      svg(
        `<path d="M12 20s-7-4.5-9.5-9C1 8 2 4 5.5 4 8 4 10 6 12 8c2-2 4-4 6.5-4C22 4 23 8 21.5 11 19 15.5 12 20 12 20Z" ${filled ? 'fill="currentColor"' : ""}/>`
      ),

    messageCircle: () =>
      svg('<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>'),

    check: () => svg('<path d="M20 6 9 17l-5-5"/>'),

    star: ({ filled = false } = {}) =>
      svg(
        `<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" ${filled ? 'fill="currentColor"' : ""}/>`
      ),

    alertTriangle: () =>
      svg('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),

    search: () => svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>'),

    wrench: () =>
      svg('<path d="M14.7 6.3a4 4 0 0 0-5.6 5.6l-6 6a2 2 0 1 0 2.8 2.8l6-6a4 4 0 0 0 5.6-5.6l-2.5 2.5-2.8-2.8 2.5-2.5Z"/>'),

    gift: () =>
      svg('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),

    recycle: () =>
      svg('<path d="M7 19H4.8a2 2 0 0 1-1.8-2.9l1.6-3.2"/><path d="m17 19-1.6-3.2"/><path d="M17.7 6.5 15.5 3 13 6.8"/><path d="M7.3 6.5 9.5 3l2.5 3.8"/><path d="m12.5 21.5-2.5-4.3h5l-2.5 4.3Z"/><path d="M20 15h-3.5l1.7 2.9a2 2 0 0 1-1.7 3.1"/>'),

    layers: () =>
      svg('<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),

    globe: () =>
      svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10Z"/>'),

    award: () =>
      svg('<circle cx="12" cy="8" r="6"/><path d="m8.5 13.5-1 7 4.5-2.5 4.5 2.5-1-7"/>'),
  };
})();
