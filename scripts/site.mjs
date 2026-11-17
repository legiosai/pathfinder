// The public address of the site: the one setting to change when it moves to another domain.
// Canonical links, Open Graph tags, sitemap.xml, robots.txt, the plan export footer and the
// share images are built from it. SITE_URL in the environment overrides it for one build.
// Pages and assets link to each other with relative paths, so the same build works under a
// subpath (/pathfinder/) or at the root of a domain.
export const DEFAULT_SITE = 'https://legiosai.github.io/pathfinder/';
export const SITE = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/?$/, '/');
