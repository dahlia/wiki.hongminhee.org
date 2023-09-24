import { AppContext } from "$fresh/server.ts";

export interface Site {
  siteName: string;
  defaultTheme: "light" | "dark" | "system";
  indexFile: string;
  noindex: boolean;
}

export async function getSite(): Promise<Site> {
  const kv = await Deno.openKv();
  const cacheKey = ["site", "1bed1be957c214a143314dc6096751aa"];
  const cache = await kv.get<Site>(cacheKey);
  if (cache.value) return cache.value;
  const response = await fetch(
    "https://publish-01.obsidian.md/options/1bed1be957c214a143314dc6096751aa",
  );
  const site = await response.json();
  await kv.set(cacheKey, site, { expireIn: 600_000 });
  return site;
}

export default async function App(_: Request, { Component }: AppContext) {
  const site = await getSite();
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{site.siteName}</title>
      </head>
      <body class="bg-gray-50 text-gray-800">
        <Component />
      </body>
    </html>
  );
}
