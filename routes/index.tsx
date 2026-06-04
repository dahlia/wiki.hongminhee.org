import { define } from "@/utils.ts";
import { getSite } from "./_app.tsx";

export const handler = define.handlers({
  async GET(ctx) {
    const site = await getSite();
    return new Response(`Redirecting to ${site.indexFile}…`, {
      status: 301,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Location: new URL(site.indexFile, ctx.req.url).href,
      },
    });
  },
});
