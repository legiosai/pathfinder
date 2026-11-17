// The public address of the site: the one setting to change when it moves to another domain.
// Canonical links, Open Graph tags, sitemap.xml, robots.txt, the plan export footer and the
// share images are built from it. SITE_URL in the environment overrides it for one build.
// Pages and assets link to each other with relative paths, so the same build works under a
// subpath (/pathfinder/) or at the root of a domain.
export const DEFAULT_SITE = 'https://legiosai.github.io/pathfinder/';
export const SITE = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/?$/, '/');

// Where the chat sends messages (POST <CHAT_API>/chat). site/chat.js carries the default and the
// build writes this one in its place; CHAT_API in the environment overrides it for one build.
// For development, ?chat=<loopback url> in the page address points one browser elsewhere.
export const DEFAULT_CHAT_API = 'https://pathfinder-api.legios.com.ar';
export const CHAT_API = (process.env.CHAT_API || DEFAULT_CHAT_API).replace(/\/+$/, '');
