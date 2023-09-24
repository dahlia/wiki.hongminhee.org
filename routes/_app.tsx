import { asset } from "$fresh/runtime.ts";
import { AppContext } from "$fresh/server.ts";
import { getConfig } from "../utils/config.ts";

export interface Site {
  siteName: string;
  defaultTheme: "light" | "dark" | "system";
  indexFile: string;
  noindex: boolean;
}

export async function getSite(): Promise<Site> {
  const { siteId, cacheExpiresInMs } = getConfig();
  const kv = await Deno.openKv();
  const cacheKey = ["site", siteId];
  const cache = await kv.get<Site>(cacheKey);
  if (cache.value) return cache.value;
  const response = await fetch(
    `https://publish-01.obsidian.md/options/${siteId}`,
  );
  const site = await response.json();
  await kv.set(cacheKey, site, { expireIn: cacheExpiresInMs });
  return site;
}

export default async function App(_: Request, { Component }: AppContext) {
  const site = await getSite();
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{site.siteName}</title>
        <link rel="stylesheet" href={asset("style.css")} />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
