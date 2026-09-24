import { globSync } from "glob";
import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

// Files that never belong in the generated navigation. The root `index.md` is
// the homepage (its own nav entry), and anything under these directories is
// either build machinery or non-topic content.
const EXCLUDE = [
  "node_modules/**",
  ".vitepress/**",
  ".worktrees/**",
  ".github/**",
  "docs/**",
  "specs/**",
  "prompts/**",
  "scripts/**",
  "index.md",
];

// Co-located artifact files keyed off the established extension conventions:
// tests, specs, worked examples, prompt templates, and fill-in templates. They
// are linked from the topic page that documents them, not standalone topics.
// Keying off the extension (rather than a single marker) keeps a `.spec.md`
// discoverable by a spec runner while staying out of the nav.
const ARTIFACT = /\.(test|spec|example|prompt|template)\./;

/**
 * Title-case a hyphen/dot-separated segment. `getting-started` → `Getting
 * Started`. Abbreviations and proper nouns should be fixed with an explicit
 * frontmatter `title` rather than relying on this fallback.
 */
export function formatSegment(segment) {
  return segment
    .split(/[-.]/)
    .map(word => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function extractFrontmatter(filePath) {
  try {
    return matter(readFileSync(filePath, "utf-8")).data;
  } catch {
    return {};
  }
}

function extractTitle(filePath) {
  return (
    extractFrontmatter(filePath).title || formatSegment(basename(filePath, ".md"))
  );
}

/**
 * The canonical set of repo-relative `.md` paths the site deliberately indexes:
 * every markdown topic page minus the carve-outs (the excluded directories, the
 * homepage, co-located artifact files, and auto-generated `layout: code-only`
 * source-viewer wrappers). Both the nav (`generateNav`) and the coverage test
 * derive from this single list so the surfaces can't silently drift.
 */
export function indexedPages({ exclude = [] } = {}) {
  const ignore = [...EXCLUDE, ...exclude];
  return globSync("**/*.md", { ignore })
    .filter(f => !ARTIFACT.test(basename(f)))
    .filter(f => extractFrontmatter(f).layout !== "code-only")
    .sort();
}

function pageFor(file) {
  return {
    file,
    segments: file.replace(/\.md$/, "").split("/"),
    title: extractTitle(file),
    link: "/" + file.replace(/\.md$/, "").replace(/\/index$/, "/"),
  };
}

function groupByTopLevel(pages) {
  const groups = new Map();
  for (const page of pages) {
    const key = page.segments[0];
    if (!groups.has(key)) {
      groups.set(key, { key, name: formatSegment(key), pages: [] });
    }
    groups.get(key).pages.push(page);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isSingleTopLevelFile(section) {
  return section.pages.length === 1 && section.pages[0].segments.length === 1;
}

/**
 * The display title for a section, preferring the section's own index page
 * frontmatter title (`guide/index.md`) over the formatted directory name.
 */
function sectionTitle(section) {
  const indexPage = section.pages.find(p => p.link === `/${section.key}/`);
  return indexPage ? indexPage.title : section.name;
}

function buildNav(sections) {
  return sections.map(section => {
    if (isSingleTopLevelFile(section)) {
      const page = section.pages[0];
      return { text: page.title, link: page.link };
    }
    // Prefer the section index page; otherwise link to the first page.
    const indexPage = section.pages.find(p => p.link === `/${section.key}/`);
    const sorted = [...section.pages].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    return {
      text: sectionTitle(section),
      link: (indexPage || sorted[0]).link,
    };
  });
}

function buildSidebarGroup(section) {
  const items = [...section.pages]
    // The section index page heads the group as its top link, not a child item.
    .filter(p => p.link !== `/${section.key}/`)
    .map(p => ({ text: p.title, link: p.link }))
    .sort((a, b) => a.text.localeCompare(b.text));
  const group = { text: sectionTitle(section), items };
  if (section.pages.some(p => p.link === `/${section.key}/`)) {
    group.link = `/${section.key}/`;
  }
  return group;
}

function buildSidebar(sections) {
  const sidebar = {};
  for (const section of sections) {
    if (isSingleTopLevelFile(section)) continue;
    sidebar[`/${section.key}/`] = [buildSidebarGroup(section)];
  }
  return sidebar;
}

/**
 * Generate VitePress `nav` and `sidebar` config from the file system. The
 * folder structure is the single source of truth: add or move a markdown file
 * and the navigation updates at build time.
 */
export function generateNav({ exclude = [] } = {}) {
  const pages = indexedPages({ exclude }).map(pageFor);
  const sections = groupByTopLevel(pages);
  return {
    nav: buildNav(sections),
    sidebar: buildSidebar(sections),
  };
}
