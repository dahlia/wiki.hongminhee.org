import { getSite } from "./_app.tsx";

export async function handler(req: Request): Promise<Response> {
  const site = await getSite();
  return new Response(`Redirecting to ${site.indexFile}\u2026`, {
    status: 301,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      Location: new URL(site.indexFile, req.url).href,
    },
  });
}
