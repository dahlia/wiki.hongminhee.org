import { escape } from "@std/html";
import { encodeHex } from "@std/encoding/hex";
import { HttpError, page as pageData } from "fresh";
import { define } from "@/utils.ts";
import { getSite, Site } from "./_app.tsx";
import MarkdownIt from "markdown-it";
import mdFootnote from "markdown-it-footnote";
import mdFrontMatter from "markdown-it-front-matter";
import mdTaskList from "markdown-it-task-list-plus";
import mdAnchor from "markdown-it-anchor";
import { load, type Gukhanmun } from "@gukhanmun/wasm";
import { stdictFst } from "@gukhanmun/stdict-fst";
import { Plugin } from "@/utils/markdown-it-regexp.ts";
import { getConfig } from "@/utils/config.ts";

const converterPromise: Promise<Gukhanmun> = (async () =>
  load({
    dictionaries: [await stdictFst()],
    rendering: "ruby-on-hanja",
  }))();

interface PageMeta {
  headings: Heading[];
  links: Link[];
}

interface Heading {
  heading: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  pos: Pos;
}

interface Link {
  link: string;
  displayText: string;
  pos: Pos;
}

type Pos = [number, number, number, number, number, number];

async function getPages(): Promise<Record<string, PageMeta>> {
  const { siteId, cacheExpiresInMs } = getConfig();
  const kv = await Deno.openKv();
  const cacheKey = ["pages", siteId];
  const cache = await kv.get<Record<string, PageMeta>>(cacheKey);
  if (cache.value) return cache.value;
  const response = await fetch(
    `https://publish-01.obsidian.md/cache/${siteId}`,
  );
  const data = await response.json();
  const filtered = Object.entries(data)
    .filter(([page]) => page.match(/\.md$/i))
    .map(([page, meta]) => [page.slice(0, -3), meta]);
  const pages = Object.fromEntries(filtered);
  await kv.set(cacheKey, pages, { expireIn: cacheExpiresInMs });
  return pages;
}

async function getPageBody(page: string): Promise<string | null> {
  const { siteId } = getConfig();
  const response = await fetch(
    `https://publish-01.obsidian.md/access/${siteId}/${
      encodeURIComponent(page)
    }.md`,
  );
  if (!response.ok || response.headers.get("etag") === "404") return null;
  return await response.text();
}

const mdObsidian = new Plugin(
  /(!)?\[\[([^|]+?)(\|([\s\S]+?))?\]\]/,
  (match: RegExpExecArray, env: Record<string, unknown>) => {
    const [page, anchor] = match[2].split("#", 2);
    const href = encodeURIComponent(page) + (anchor ? `#${anchor}` : "");
    if (match[1]) {
      // image
      const { siteId } = getConfig();
      const currentPage = env.currentPage as string;
      return `<img src="https://publish-01.obsidian.md/access/${siteId}/${
        escape(
          page.startsWith("/") ? href.substring(3) : `${currentPage}/${href}`,
        )
      }" alt="${escape(match[3] ?? match[2])}">`;
    } else {
      // internal link
      const pages = env.pages as Record<string, PageMeta>;
      if (pages[page]) {
        return `<a href="${escape(href)}" class="internal-link">${
          escape(match[3] ?? match[2])
        }</a>`;
      }
      return `<em class="missing-link">${escape(match[3] ?? match[2])}</em>`;
    }
  },
);

const md = new MarkdownIt({ breaks: true, linkify: true, html: true })
  // deno-lint-ignore no-explicit-any
  .use(mdObsidian as any)
  .use(mdAnchor, {
    getTokensText(
      tokens: { type: string; meta: { match: RegExpExecArray }; content: string }[],
    ) {
      return tokens.map((t) =>
        t.type.startsWith("regexp-")
          ? t.meta.match[0].replaceAll(/\[\[|\]\]/g, "")
          : t.content
      ).join("");
    },
  })
  .use(mdFootnote)
  .use(mdTaskList, { label: true })
  .use(mdFrontMatter, (_fm: unknown) => void 0);

export const handler = define.handlers({
  async GET(ctx) {
    const pageName = ctx.params.page;
    const [body, site, pages] = await Promise.all([
      getPageBody(pageName),
      getSite(),
      getPages(),
    ]);
    if (body === null) throw new HttpError(404);
    const bodyHtml = await renderBodyHtml(body, pageName, pages);

    const homeUrl = new URL(site.indexFile, ctx.req.url);
    const permalink = new URL(pageName, homeUrl);
    ctx.state.title = `${pageName} — ${site.siteName}`;
    ctx.state.page = pageName;
    ctx.state.canonicalUrl = permalink.href;

    return pageData({ site, page: pageName, body, bodyHtml, pages });
  },
});

async function renderBodyHtml(
  body: string,
  currentPage: string,
  pages: Record<string, PageMeta>,
): Promise<string> {
  const { cacheExpiresInMs } = getConfig();
  const kv = await Deno.openKv();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const hashHex = encodeHex(new Uint8Array(hash));
  const cacheKey = [
    "bodyHtml",
    "gukhanmun-0.1",
    hashHex,
    Deno.env.get("DENO_DEPLOYMENT_ID") ?? Deno.pid,
  ];
  const cache = await kv.get<string>(cacheKey);
  if (cache.value) return cache.value;

  const mdHtml = md.render(body, { pages, currentPage });
  const converter = await converterPromise;
  const converted = converter.convert(mdHtml, "html");
  try {
    await kv.set(cacheKey, converted, { expireIn: cacheExpiresInMs });
  } catch (e) {
    if (e instanceof TypeError && e.message.match(/value too large/i)) {
      return converted;
    }
    throw e;
  }
  return converted;
}

export default define.page<typeof handler>((ctx) => {
  const { site, page, bodyHtml, pages } = ctx.data;
  const homeUrl = new URL(site.indexFile, ctx.url);
  const pageList = Object.entries(pages);
  pageList.sort(([a], [b]) => a.localeCompare(b));
  return (
    <main>
      <header>
        <p class="site-name">
          <a href={homeUrl.href}>{site.siteName}</a>
        </p>
      </header>
      <article>
        <h1>
          <a href={new URL(page, homeUrl).href}>{page}</a>
        </h1>
        <div
          class="content"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>
      <footer>
        <nav>
          <ul>
            {pageList.map(([p]) => (
              <li>
                {p === page
                  ? <strong>{p}</strong>
                  : (
                    <a href={new URL(p, homeUrl).href}>
                      {p}
                    </a>
                  )}
              </li>
            ))}
          </ul>
        </nav>
      </footer>
    </main>
  );
});
