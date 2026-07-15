// Tell vitepress that `.html` is a known static-asset extension. Without
// this, vitepress's client-side router intercepts `.html` link clicks,
// strips the extension, and tries to load a `.md` page at the bare URL —
// which 404s for browser-renderable HTML demos. With `html` in the known
// set, `treatAsHtml(".html")` returns false, the click handler skips
// intercept, and the browser does a normal same-tab navigation.
process.env.VITE_EXTRA_EXTENSIONS ??= "html";

import { defineConfig } from "vitepress";
import { globSync } from "glob";
// FIXME: gray-matter pulls in js-yaml 3.x, which carries a moderate advisory
// (GHSA-h67p-54hq-rp68: quadratic-complexity DoS via repeated merge-key
// aliases). The risk here is minimal: frontmatter is parsed at build time from
// maintainer-authored files, never untrusted input. Watch for a maintained
// gray-matter or a replacement parser and revisit then.
import matter from "gray-matter";
import {
  readFileSync, writeFileSync, existsSync,
} from "node:fs";
import {
  dirname, basename, posix,
} from "node:path";
import { fileURLToPath } from "node:url";
import { DOCS_BASE, repoPathToUrl } from "./url.js";
import { renderForIndex, tokenize, processTerm } from "./search-helpers.js";
import { generateNav, formatSegment } from "./nav.js";

/**
 * Build the breadcrumb trail shown above a page title, derived from the page's
 * ancestor directories. For `guide/getting-started.md` the trail is a single
 * `Guide` crumb; for `reference/errors/process-error.md` it is `Reference /
 * Errors`. A directory that renders its own page (an `index.md`) links to its
 * directory URL, using that page's frontmatter title as the label; a grouping
 * directory with no `index.md` renders as plain text. The homepage and other
 * top-level pages get no trail.
 */
function buildBreadcrumbs(relativePath) {
  const parts = relativePath.split("/");
  const fileName = parts[parts.length - 1];
  let dirSegments = parts.slice(0, -1);
  // An index.md renders at its directory URL, so the final directory segment is
  // the page itself, not an ancestor — drop it.
  if (fileName === "index.md") {
    dirSegments = dirSegments.slice(0, -1);
  }
  if (dirSegments.length === 0) return [];

  const crumbs = [];
  let dir = "";
  for (const segment of dirSegments) {
    dir = dir ? `${dir}/${segment}` : segment;
    const indexFile = `${dir}/index.md`;
    let link = null;
    let text = formatSegment(segment);
    if (existsSync(indexFile)) {
      link = `/${dir}/`;
      try {
        const { data } = matter(readFileSync(indexFile, "utf-8"));
        if (data.title) text = data.title;
      } catch {
        // fall back to the formatted segment
      }
    }
    crumbs.push({ text, link });
  }
  return crumbs;
}

/**
 * Extensions the browser handles natively. For these, we emit the raw file at
 * the native URL — no rendered viewer, no `.raw` alternate.
 */
const BROWSER_HANDLES = new Set([
  "html", "htm",
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico",
  "pdf", "zip", "gz", "tar",
  "mp3", "mp4", "wav", "ogg", "webm", "mov",
  "ttf", "woff", "woff2", "otf",
]);

/**
 * MIME types for the dev-mode middleware response. Production builds get
 * Content-Type from the static host (GitHub Pages auto-detects).
 */
const MIME_TYPES = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  webm: "video/webm",
  mov: "video/quicktime",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2",
  otf: "font/otf",
};

// Directories whose markdown is not part of the docs site — skip them when
// scanning for linked assets, matching the nav/srcExclude carve-outs.
const NON_DOC_GLOBS = [
  "**/node_modules/**",
  ".vitepress/**",
  ".worktrees/**",
  ".github/**",
  "docs/**",
  "specs/**",
  "prompts/**",
  "scripts/**",
  "dist/**",
];

/**
 * Discover non-markdown files linked from any markdown file in the source
 * tree. Returns two buckets: `code` (renderable as a syntax-highlighted page)
 * and `page` (browser handles directly). Targets that don't exist on disk are
 * dropped silently — this isn't a link checker; vitepress already does that.
 */
function discoverLinkedAssets() {
  const mdFiles = globSync("**/*.md", { ignore: NON_DOC_GLOBS });
  const code = new Set();
  const page = new Set();
  const inlineRe = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const refDefRe = /^[ \t]*\[([^\]]+)\]:[ \t]+(\S+)/gm;
  const refUseRe = /\[(?:[^\]\n]|\\\])*\]\[([^\]\n]+)\]/g;

  function classify(url, mdDir) {
    const clean = url.split("#")[0].split("?")[0];
    if (!clean || /^[a-z]+:\/\//i.test(clean) || clean.startsWith("/")) return;
    if (clean.endsWith(".md") || clean.endsWith("/")) return;
    const target = posix.normalize(posix.join(mdDir, clean));
    if (target.startsWith("..") || !existsSync(target)) return;
    const base = basename(target);
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
    // VitePress ignores dotfile-prefixed paths when scanning sources, so a
    // `.X.md` wrapper there won't be built — treat those as raw assets.
    const inHiddenDir = target.split("/").some((seg) => seg.startsWith("."));
    // Extensionless files (LICENSE, etc.) get raw at native URL — no language
    // to highlight, and a wrapper would collide with the page build.
    if (BROWSER_HANDLES.has(ext) || inHiddenDir || !ext) {
      page.add(target);
    } else {
      code.add(target);
    }
  }

  for (const mdFile of mdFiles) {
    const stripped = readFileSync(mdFile, "utf-8")
      .replace(/```[\s\S]*?```/g, "") // skip fenced code blocks
      .replace(/`[^`]*`/g, "");       // skip inline code
    const mdDir = dirname(mdFile);
    for (const match of stripped.matchAll(inlineRe)) {
      classify(match[1], mdDir);
    }
    const refDefs = new Map();
    for (const match of stripped.matchAll(refDefRe)) {
      refDefs.set(match[1].toLowerCase(), match[2]);
    }
    for (const match of stripped.matchAll(refUseRe)) {
      const url = refDefs.get(match[1].toLowerCase());
      if (url) classify(url, mdDir);
    }
  }
  return { code: [...code], page: [...page] };
}

/**
 * Auto-generate a `.X.md` wrapper for each linked code file that lacks one.
 * Wrappers hold just a frontmatter stanza and a `<<<` snippet import; vitepress
 * builds the rendered viewer page from them.
 */
function ensureCodeWrappers(codeAssets) {
  for (const target of codeAssets) {
    const wrapperPath = target + ".md";
    if (existsSync(wrapperPath)) continue;
    const title = basename(target);
    writeFileSync(
      wrapperPath,
      `---\ntitle: "${title}"\nlayout: code-only\n---\n\n<<< @/${target}\n`,
    );
  }
}

/**
 * Vite plugin that publishes non-markdown linked assets to the docs site so
 * relative links from markdown resolve to a real URL. Build mode emits files
 * into `dist/`; dev mode serves the same URLs via middleware.
 */
function linkedAssetsPlugin({ code, page }) {
  let base = "/";
  const codeSet = new Set(code);
  const pageSet = new Set(page);
  return {
    name: "linked-assets",
    configResolved(config) {
      base = config.base;
    },
    generateBundle() {
      for (const target of codeSet) {
        this.emitFile({
          type: "asset",
          fileName: target + ".raw",
          source: readFileSync(target),
        });
      }
      for (const target of pageSet) {
        this.emitFile({
          type: "asset",
          fileName: target,
          source: readFileSync(target),
        });
      }
    },
    configureServer(server) {
      const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      function stripBase(url) {
        const match = url.match(
          new RegExp(`^${escapedBase}(.+?)(?:\\?.*)?$`),
        );
        return match ? match[1] : null;
      }
      server.middlewares.use((req, res, next) => {
        const path = stripBase(req.url ?? "");
        if (!path) return next();
        if (path.endsWith(".raw")) {
          const target = path.slice(0, -".raw".length);
          if (codeSet.has(target)) {
            try {
              res.setHeader("content-type", "text/plain; charset=utf-8");
              res.end(readFileSync(target));
            } catch {
              next();
            }
            return;
          }
        }
        const pageTarget = pageSet.has(path) ? path :
          pageSet.has(path + ".html") ? path + ".html" :
          null;
        if (pageTarget) {
          try {
            const ext = pageTarget
              .slice(pageTarget.lastIndexOf(".") + 1)
              .toLowerCase();
            res.setHeader(
              "content-type",
              MIME_TYPES[ext] || "text/plain; charset=utf-8",
            );
            res.end(readFileSync(pageTarget));
          } catch {
            next();
          }
          return;
        }
        // Code native URL: rewrite to SPA shell so the rendered viewer page
        // wins over vite's static-file serving of the raw source.
        if (codeSet.has(path)) {
          req.url = base;
        }
        next();
      });
    },
  };
}

// Discover linked assets and ensure code wrappers exist *before* vitepress
// scans for source `.md` files — otherwise the auto-generated wrappers won't
// show up in the page map for the first build.
const linkedAssets = discoverLinkedAssets();
ensureCodeWrappers(linkedAssets.code);

const { nav, sidebar } = generateNav();

export default defineConfig({
  title: "sh-cmd-tag",
  description:
    "Template tag functions for shell command execution with streaming " +
    "output, safe interpolation, and flexible I/O control",
  base: new URL(DOCS_BASE).pathname,
  cleanUrls: true,
  srcDir: ".",
  srcExclude: [
    "**/node_modules/**",
    ".vitepress/**",
    ".worktrees/**",
    ".github/**",
    "docs/**",
    "specs/**",
    "prompts/**",
    "scripts/**",
    "dist/**",
    "README.md",
    "STYLE.md",
    "AGENTS.md",
    "CLAUDE.md",
    "**/*.test.*.md",
  ],

  vite: {
    resolve: {
      alias: [
        {
          // Swap the built-in local-search box for our fork, which builds a
          // best-match excerpt from the indexed page text.
          find: /^.*[\\/]VPLocalSearchBox\.vue$/,
          replacement: fileURLToPath(
            new URL("./theme/components/CustomSearchBox.vue", import.meta.url),
          ),
        },
      ],
    },
    define: {
      "import.meta.env.VITE_EXTRA_EXTENSIONS":
        JSON.stringify(process.env.VITE_EXTRA_EXTENSIONS),
    },
    plugins: [linkedAssetsPlugin(linkedAssets)],
  },

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      ...nav,
    ],
    sidebar,
    socialLinks: [
      { icon: "github", link: "https://github.com/chriscalo/sh-cmd-tag" },
    ],
    search: {
      provider: "local",
      options: {
        // Show a content excerpt with highlighted matches under each result's
        // title, so you can see *what* matched, not just which page.
        detailedView: true,
        _render: renderForIndex,
        miniSearch: {
          options: {
            tokenize,
            processTerm,
            // Keep the rendered page text in the index so the search component
            // can build a best-match excerpt on the client.
            storeFields: ["title", "titles", "text"],
          },
          searchOptions: {
            combineWith: "AND",
            fuzzy: false,
            prefix: true,
            boost: { title: 4, titles: 2, text: 1 },
          },
        },
      },
    },
  },

  transformPageData(pageData) {
    // Derive the copy-link URL from the same helper the site's own links use.
    pageData.fullUrl = repoPathToUrl(pageData.relativePath);

    // Breadcrumb trail rendered above the page title.
    pageData.breadcrumbs = buildBreadcrumbs(pageData.relativePath);

    // Raw markdown for the copy-markdown button.
    try {
      const content = readFileSync(pageData.filePath, "utf-8");
      pageData.markdownSourceBase64 = Buffer.from(content).toString("base64");
    } catch {
      pageData.markdownSourceBase64 = null;
    }
  },
});
