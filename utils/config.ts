export interface Config {
  siteId: string;
  cacheExpiresInMs: number;
  seonbiApiUrl: URL;
  plausibleDomain: string | null;
}

let loadedConfig: Config | undefined;

export function getConfig(): Config {
  if (loadedConfig) return loadedConfig;
  const siteId = Deno.env.get("OBSIDIAN_PUBLISH_SITE_ID");
  const cacheExpiresInMs = parseInt(
    Deno.env.get("CACHE_EXPIRES_IN_MS") ?? "60000",
  );
  const seonbiApiUrl = Deno.env.get("SEONBI_API_URL");
  const plausibleDomain = Deno.env.get("PLAUSIBLE_DOMAIN") ?? null;
  if (!siteId) throw new Error("OBSIDIAN_PUBLISH_SITE_ID is not set");
  else if (!seonbiApiUrl) throw new Error("SEONBI_API_URL is not set");
  return loadedConfig = {
    siteId,
    cacheExpiresInMs,
    seonbiApiUrl: new URL(seonbiApiUrl),
    plausibleDomain,
  };
}
