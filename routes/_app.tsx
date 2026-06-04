import { define } from "@/utils.ts";
import { getConfig } from "@/utils/config.ts";

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

export default define.page(async (ctx) => {
  const site = await getSite();
  const { plausibleDomain } = getConfig();
  const title = ctx.state.title ?? site.siteName;
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        <link rel="stylesheet" href="/style.css" />
        {ctx.state.canonicalUrl && (
          <>
            <link rel="canonical" href={ctx.state.canonicalUrl} />
            <meta
              property="og:title"
              content={ctx.state.page ?? site.siteName}
            />
            <meta property="og:site_name" content={site.siteName} />
            <meta property="og:url" content={ctx.state.canonicalUrl} />
            <meta property="og:type" content="article" />
            <meta property="og:locale" content="ko" />
          </>
        )}
        {plausibleDomain && (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body>
        <ctx.Component />
      </body>
    </html>
  );
});
