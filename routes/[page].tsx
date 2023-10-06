import { escape } from "$std/html/mod.ts";
import { toHashString } from "$std/crypto/to_hash_string.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import { getSite, Site } from "./_app.tsx";
import MarkdownIt from "npm:markdown-it";
import mdFootnote from "npm:markdown-it-footnote";
import mdFrontMatter from "npm:markdown-it-front-matter";
import mdTaskList from "npm:markdown-it-task-list-plus";
import mdAnchor from "npm:markdown-it-anchor";
import { Seonbi } from "https://github.com/dahlia/seonbi/raw/main/scripts/deno/mod.ts";
import { Plugin } from "../utils/markdown-it-regexp.ts";
import { getConfig } from "../utils/config.ts";
const { siteId, cacheExpiresInMs } = getConfig();

interface Page {
  site: Site;
  page: string;
  body: string;
  bodyHtml: string;
  pages: Record<string, PageMeta>;
}

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
  if (!response.ok) return null;
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
  .use(mdObsidian)
  .use(mdAnchor)
  .use(mdFootnote)
  .use(mdTaskList, { label: true })
  .use(mdFrontMatter, (fm: unknown) => void (0));

export const handler: Handlers = {
  async GET(_req, ctx) {
    const bodyPromise = getPageBody(ctx.params.page);
    const sitePromise = getSite();
    const pagesPromise = getPages();
    const body = await bodyPromise;
    if (body === null) return ctx.renderNotFound();
    const site = await sitePromise;
    const pages = await pagesPromise;
    const bodyHtml = await renderBodyHtml(body, ctx.params.page, pages);
    return ctx.render({ site, page: ctx.params.page, body, bodyHtml, pages });
  },
};

async function renderBodyHtml(
  body: string,
  currentPage: string,
  pages: Record<string, PageMeta>,
): Promise<string> {
  const { cacheExpiresInMs, seonbiApiUrl } = getConfig();
  const kv = await Deno.openKv();
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(body),
  );
  const cacheKey = [
    "bodyHtml",
    toHashString(hash, "base64"),
    Deno.env.get("DENO_DEPLOYMENT_ID") ?? Deno.pid,
  ];
  const cache = await kv.get<string>(cacheKey);
  if (cache.value) return cache.value;

  const mdHtml = md.render(body, { pages, currentPage });
  const seonbi = new Seonbi({ apiUrl: seonbiApiUrl });
  const seonbiHtml = await seonbi.transform(mdHtml, {
    arrow: null,
    cite: null,
    contentType: "text/html",
    ellipsis: false,
    emDash: false,
    hanja: {
      reading: {
        dictionary: {},
        initialSoundLaw: true,
        useDictionaries: ["kr-stdict"],
      },
      rendering: "HanjaInRuby",
    },
    quote: null,
    stop: null,
  });
  // FIXME Make Seonbi not to generate CDATA
  const cdataStripped = seonbiHtml.replaceAll(
    /<!\[CDATA\[.*?\]\]>/g,
    (m: string) => m.slice(9, -3),
  );
  try {
    await kv.set(cacheKey, cdataStripped, { expireIn: cacheExpiresInMs });
  } catch (e) {
    if (e instanceof TypeError && e.message.match(/value too large/i)) {
      return cdataStripped;
    }

    throw e;
  }
  return cdataStripped;
}

export default function Page(
  { url, params, data: { site, page, bodyHtml, pages } }: PageProps<Page>,
) {
  const homeUrl = new URL(site.indexFile, url);
  const permalink = new URL(page, homeUrl);
  const pageList = Object.entries(pages);
  pageList.sort(([a], [b]) => a.localeCompare(b));
  return (
    <>
      <Head>
        <title>{page} &mdash; {site.siteName}</title>
        <link rel="canonical" href={permalink.href} />
        <meta property="og:title" content={page} />
        <meta property="og:site_name" content={site.siteName} />
        <meta property="og:url" content={permalink.href} />
        <meta property="og:type" content="article" />
        <meta property="og:locale" content="ko" />
      </Head>
      <main>
        <header>
          <p class="site-name">
            <a href={homeUrl.href}>{site.siteName}</a>
          </p>
        </header>
        <article>
          <h1>
            <a href={permalink.href}>{page}</a>
          </h1>
          <div class="content" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
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
    </>
  );
}
