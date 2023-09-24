import { escape } from "$std/html/mod.ts";
import { toHashString } from "$std/crypto/to_hash_string.ts";
import { Handlers, PageProps } from "$fresh/server.ts";
import { Head } from "$fresh/runtime.ts";
import { getSite, Site } from "./_app.tsx";
import MarkdownIt from "npm:markdown-it";
import mdFootnote from "npm:markdown-it-footnote";
import mdFrontMatter from "npm:markdown-it-front-matter";
import { tw } from "twind";
import { Seonbi } from "https://github.com/dahlia/seonbi/raw/main/scripts/deno/mod.ts";
import { Plugin } from "../utils/markdown-it-regexp.ts";
import { getConfig } from "../utils/config.ts";
const { siteId, cacheExpiresInMs } = getConfig();

interface Page {
  site: Site;
  page: string;
  body: string;
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
      return `<img src="https://publish-01.obsidian.md/access/${siteId}/${
        escape(href)
      }" alt="${escape(match[3] ?? match[2])}">`;
    } else {
      // internal link
      const pages = env.pages as Record<string, PageMeta>;
      if (pages[page]) {
        return `<a href="${escape(href)}">${escape(match[3] ?? match[2])}</a>`;
      }
      return `<strong class="${
        tw("not-italic font-bold !text-gray-500 underline !decoration-dotted")
      }">${escape(match[3] ?? match[2])}</strong>`;
    }
  },
);

const md = new MarkdownIt()
  .use(mdObsidian)
  .use(mdFootnote)
  .use(mdFrontMatter, (fm: unknown) => void (0));

const orig_footnote_caption = md.renderer.rules.footnote_caption;
md.renderer.rules.footnote_caption = (tokens: unknown, idx: number) =>
  orig_footnote_caption(tokens, idx).slice(1, -1);

const orig_footnote_ref = md.renderer.rules.footnote_ref;
md.renderer.rules.footnote_ref = (
  tokens: unknown,
  idx: number,
  options: unknown,
  env: unknown,
  slf: typeof MarkdownIt,
) =>
  orig_footnote_ref(tokens, idx, options, env, slf).replace(
    /<a href=/,
    `<a class="${
      tw(`!no-underline !font-bold hover:bg-gray-800 hover:text-gray-50`)
    }" href=`,
  );

md.renderer.rules.footnote_block_open = () =>
  `<hr class="${tw`footnotes-sep mt-5 w-48`}">
  <section class="footnotes">
  <ol class="footnotes-list ${tw`list-style text-sm list-outside marker:text-gray-500`}">`;

const orig_footnote_open = md.renderer.rules.footnote_open;
md.renderer.rules.footnote_open = (
  tokens: unknown,
  idx: number,
  options: unknown,
  env: unknown,
  slf: unknown,
) =>
  orig_footnote_open(tokens, idx, options, env, slf).slice(0, -2) +
  ` ${tw("!pl-0")}">`;

const orig_footnote_anchor = md.renderer.rules.footnote_anchor;
md.renderer.rules.footnote_anchor = (
  tokens: unknown,
  idx: number,
  options: unknown,
  env: unknown,
  slf: unknown,
) =>
  orig_footnote_anchor(tokens, idx, options, env, slf).replace(
    /(\s+class="\s*footnote-backref\s*)(")/,
    (m: string) => m.slice(0, -1) + ` ${tw("!no-underline !text-gray-500")}"`,
  );

export const handler: Handlers = {
  async GET(_req, ctx) {
    const bodyPromise = getPageBody(ctx.params.page);
    const sitePromise = getSite();
    const pagesPromise = getPages();
    const body = await bodyPromise;
    if (body === null) return ctx.renderNotFound();
    const site = await sitePromise;
    const pages = await pagesPromise;
    const bodyHtml = await renderBodyHtml(body, pages);
    return ctx.render({ site, page: ctx.params.page, body, bodyHtml, pages });
  },
};

async function renderBodyHtml(
  body: string,
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

  const mdHtml = md.render(body, { pages });
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
  await kv.set(cacheKey, cdataStripped, { expireIn: cacheExpiresInMs });
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
      </Head>
      <div class="w-full flex flex-wrap">
        <header class="flex-initial flex-col">
          <p>
            <a
              class="flex-initial block px-5 py-5 text-4xl font-bold bg-gray-800 hover:bg-black text-gray-50 hover:text-white"
              href={homeUrl.href}
            >
              {site.siteName}
            </a>
          </p>
          <nav class="flex-auto border-r border-b border-gray-200">
            <ul class="px-5 py-5">
              {pageList.map(([page, meta]) => (
                <li>
                  <a
                    class="block my-1 text-base w-auto hover:text-black truncate hover:underline"
                    href={new URL(page, homeUrl).href}
                  >
                    {page}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <article class="flex-auto">
          <h1>
            <a
              class="block px-5 py-5 text-4xl border-b border-gray-200 w-auto hover:bg-white text-gray-800 hover:text-black"
              href={permalink.href}
            >
              {page}
            </a>
          </h1>

          <div class="px-5 py-5">
            <div
              class="prose"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
        </article>
      </div>
    </>
  );
}
