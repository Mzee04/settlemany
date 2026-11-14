/** Join an origin, a Vite base path, and a hash route. */
export function joinAppUrl(origin: string, base: string, hash: string): string {
  const route = hash.startsWith("#") ? hash : `#${hash}`;
  const prefix = base.startsWith("/") ? base : `/${base}`;
  const withSlash = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${origin.replace(/\/$/, "")}${withSlash}${route}`;
}

/** Absolute URL for a hash route, including the GitHub Pages `/settlemany/` base. */
export function pageUrl(hash: string): string {
  const base = import.meta.env.BASE_URL || "/";
  if (base.startsWith("/")) return joinAppUrl(location.origin, base, hash);
  const directory = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.replace(/[^/]*$/, "");
  return joinAppUrl(location.origin, directory || "/", hash);
}
