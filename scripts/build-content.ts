import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtName } from "./built-name.ts";
import {
    CONTENT_PAGES,
    CONTENT_SECTIONS,
    pageUrl,
    pagesInSection,
    sectionUrl,
    type ContentPage,
    type ContentSectionMeta,
} from "../content/pages.ts";

const SITE_ORIGIN = "https://itzon.tv";
const SOCIAL_IMAGE = `${SITE_ORIGIN}/api/live/site-preview.jpg?v=2`;

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const contentDirectory = fileURLToPath(new URL("../content/", import.meta.url));

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function escapeJsonLd(json: string): string {
    return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function head(title: string, description: string, canonical: string, jsonLd: string): string {
    return `<!DOCTYPE html>
<html lang="en" class="live-host">
<head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/static/img/favicon.png" />
    <link rel="apple-touch-icon" href="/static/img/icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#0d0d0d" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:site_name" content="ITZON" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${SOCIAL_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@itzonapp" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SOCIAL_IMAGE}" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/static/css/shared.css" />
    <link rel="stylesheet" href="/static/css/site.css" />
    <link rel="stylesheet" href="/static/css/content.css" />
    <script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>
</head>
<body>
<header class="site-nav">
    <a class="site-brand" href="/" aria-label="ITZON"><img class="brand-o" src="/static/img/brand-o.png" alt=""><span class="brand-wm">ITZON</span></a>
    <nav class="site-links">
        <a class="site-link" href="/" data-nav="browse">Browse</a>
    </nav>
    <div class="site-nav-right" id="site-nav-right"></div>
</header>
`;
}

function foot(bundle: string): string {
    return `<script src="/${bundle}" type="module"></script>
</body>
</html>
`;
}

function breadcrumbJsonLd(section: ContentSectionMeta, page: ContentPage | null): object {
    const items: object[] = [
        { "@type": "ListItem", position: 1, name: "ITZON", item: `${SITE_ORIGIN}/` },
        { "@type": "ListItem", position: 2, name: section.heading, item: `${SITE_ORIGIN}${sectionUrl(section.id)}` },
    ];
    if (page) {
        items.push({ "@type": "ListItem", position: 3, name: page.heading, item: `${SITE_ORIGIN}${pageUrl(page)}` });
    }
    return { "@type": "BreadcrumbList", itemListElement: items };
}

function pageJsonLd(section: ContentSectionMeta, page: ContentPage): string {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "TechArticle",
                headline: page.heading,
                name: page.heading,
                description: page.description,
                url: `${SITE_ORIGIN}${pageUrl(page)}`,
                inLanguage: "en",
                isPartOf: { "@type": "WebSite", name: "ITZON", url: `${SITE_ORIGIN}/` },
                publisher: { "@type": "Organization", name: "ITZON", url: `${SITE_ORIGIN}/` },
            },
            breadcrumbJsonLd(section, page),
        ],
    });
}

function indexJsonLd(section: ContentSectionMeta): string {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "CollectionPage",
                name: section.heading,
                description: section.description,
                url: `${SITE_ORIGIN}${sectionUrl(section.id)}`,
                inLanguage: "en",
            },
            breadcrumbJsonLd(section, null),
        ],
    });
}

function sidebar(section: ContentSectionMeta, current: ContentPage): string {
    const links = pagesInSection(section.id).map((page) => {
        const active = page.slug === current.slug ? ' class="active"' : "";
        const aria = page.slug === current.slug ? ' aria-current="page"' : "";
        return `            <a href="${pageUrl(page)}"${active}${aria}>${escapeHtml(page.heading)}</a>`;
    }).join("\n");
    return `    <aside class="content-side">
        <div class="content-side-title">${escapeHtml(section.heading)}</div>
        <nav class="content-nav">
${links}
        </nav>
    </aside>
`;
}

function crossLink(section: ContentSectionMeta): string {
    const other = CONTENT_SECTIONS.find(entry => entry.id !== section.id);
    if (!other) return "";
    return `        <div class="content-crosslink">Looking for ${escapeHtml(other.heading.toLowerCase())}? See <a href="${sectionUrl(other.id)}">${escapeHtml(other.navLabel)}</a>.</div>\n`;
}

async function renderPage(page: ContentPage, section: ContentSectionMeta, bundle: string): Promise<string> {
    const body = await readFile(join(contentDirectory, page.section, `${page.slug}.html`), "utf8");
    const indented = body.trimEnd().split("\n")
        .map(line => line === "" ? line : `        ${line}`)
        .join("\n");
    const canonical = `${SITE_ORIGIN}${pageUrl(page)}`;
    return head(page.title, page.description, canonical, pageJsonLd(section, page))
        + `<div class="content-page">\n`
        + sidebar(section, page)
        + `    <main class="content-body">\n`
        + `        <nav class="content-breadcrumb"><a href="/">ITZON</a><span>/</span><a href="${sectionUrl(section.id)}">${escapeHtml(section.heading)}</a><span>/</span>${escapeHtml(page.heading)}</nav>\n`
        + `        <h1>${escapeHtml(page.heading)}</h1>\n`
        + indented + "\n"
        + crossLink(section)
        + `    </main>\n</div>\n`
        + foot(bundle);
}

function renderIndex(section: ContentSectionMeta, bundle: string): string {
    const cards = pagesInSection(section.id).map(page =>
        `            <a class="content-index-card" href="${pageUrl(page)}">
                <div class="content-index-title">${escapeHtml(page.heading)}</div>
                <div class="content-index-summary">${escapeHtml(page.summary)}</div>
            </a>`).join("\n");
    const canonical = `${SITE_ORIGIN}${sectionUrl(section.id)}`;
    return head(section.title, section.description, canonical, indexJsonLd(section))
        + `<div class="content-page">\n`
        + `    <main class="content-body">\n`
        + `        <nav class="content-breadcrumb"><a href="/">ITZON</a><span>/</span>${escapeHtml(section.heading)}</nav>\n`
        + `        <h1>${escapeHtml(section.heading)}</h1>\n`
        + `        <p class="intro">${escapeHtml(section.intro)}</p>\n`
        + `        <div class="content-index-grid">\n${cards}\n        </div>\n`
        + crossLink(section)
        + `    </main>\n</div>\n`
        + foot(bundle);
}

function sitemap(): string {
    const urls: string[] = [];
    for (const section of CONTENT_SECTIONS) urls.push(`${SITE_ORIGIN}${sectionUrl(section.id)}`);
    for (const page of CONTENT_PAGES) urls.push(`${SITE_ORIGIN}${pageUrl(page)}`);
    const body = urls.map(url => `    <url><loc>${escapeHtml(url)}</loc></url>`).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

const bundle = await builtName(publicDirectory, "content-page");

let written = 0;
for (const section of CONTENT_SECTIONS) {
    const directory = join(publicDirectory, section.id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), renderIndex(section, bundle));
    written += 1;
    for (const page of pagesInSection(section.id)) {
        await writeFile(join(directory, `${page.slug}.html`), await renderPage(page, section, bundle));
        written += 1;
    }
}
await writeFile(join(publicDirectory, "sitemap-content.xml"), sitemap());

console.log(`built ${written} content page(s) across ${CONTENT_SECTIONS.length} section(s)`);
