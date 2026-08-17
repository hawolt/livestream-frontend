import type { Mode } from "./context.ts";

export interface ExploreSeo {
    title: string;
    description: string;
    heading: string;
    path: string;
}

const SITE_DESCRIPTION = "Watch live streams in up to 4K at 240 FPS with low latency chat. No login, no download, nothing to install.";

export function exploreSeo(mode: Mode, categoryName: string | null): ExploreSeo {
    if (mode === "streams") {
        return {
            title: "Watch live streams | ITZON",
            description: SITE_DESCRIPTION,
            heading: "Live streams on ITZON",
            path: "/",
        };
    }
    const name = categoryName === null ? "" : categoryName.trim();
    if (name === "") {
        return {
            title: "Browse stream categories | ITZON",
            description: "Browse every category being streamed live on ITZON and find a channel to watch.",
            heading: "Stream categories",
            path: "/categories",
        };
    }
    return {
        title: `${name} live streams | ITZON`,
        description: `Watch people stream ${name} live on ITZON in up to 4K at 240 FPS. No login required.`,
        heading: `${name} live streams`,
        path: `/category/${encodeURIComponent(name)}`,
    };
}

function setMeta(selector: string, content: string): void {
    const el = document.head.querySelector<HTMLMetaElement>(selector);
    if (el) el.content = content;
}

export function applyExploreSeo(seo: ExploreSeo): void {
    const url = `${location.origin}${seo.path}`;
    document.title = seo.title;
    setMeta('meta[name="description"]', seo.description);
    setMeta('meta[property="og:title"]', seo.title);
    setMeta('meta[property="og:description"]', seo.description);
    setMeta('meta[property="og:url"]', url);
    setMeta('meta[name="twitter:title"]', seo.title);
    setMeta('meta[name="twitter:description"]', seo.description);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = url;
    const heading = document.getElementById("explore-heading");
    if (heading) heading.textContent = seo.heading;
}
