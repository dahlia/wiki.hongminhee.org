export interface Config {
  siteId: string;
  cacheExpiresInMs: number;
  plausibleDomain: string | null;
}

let loadedConfig: Config | undefined;

export function getConfig(): Config {
  if (loadedConfig) return loadedConfig;
  const siteId = Deno.env.get("OBSIDIAN_PUBLISH_SITE_ID");
  const cacheExpiresInMs = parseInt(
    Deno.env.get("CACHE_EXPIRES_IN_MS") ?? "60000",
  );
  const plausibleDomain = Deno.env.get("PLAUSIBLE_DOMAIN") ?? null;
  if (!siteId) throw new Error("OBSIDIAN_PUBLISH_SITE_ID is not set");
  return loadedConfig = { siteId, cacheExpiresInMs, plausibleDomain };
}
