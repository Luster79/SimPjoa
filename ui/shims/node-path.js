// ui/shims/node-path.js — minimal dirname/join for the URL strings that
// flow through core/config.js's __dirname/DATA_DIR computation in the
// browser (see node-url.js for why this shim set exists). Operates via the
// URL constructor so '..' segments resolve exactly the way a real
// filesystem path would, and the result stays a fetchable URL throughout.

export function dirname(urlStr) {
  const u = new URL(urlStr);
  const segments = u.pathname.split('/');
  segments.pop();
  u.pathname = segments.join('/') || '/';
  return u.origin + u.pathname;
}

export function join(base, ...segments) {
  const baseWithSlash = base.endsWith('/') ? base : base + '/';
  const rel = segments.join('/');
  return new URL(rel, baseWithSlash).href;
}

export default { dirname, join };
