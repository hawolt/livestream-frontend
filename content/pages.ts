export type ContentSection = "guides" | "docs";

export interface ContentPage {
    section: ContentSection;
    slug: string;
    heading: string;
    title: string;
    description: string;
    summary: string;
}

export interface ContentSectionMeta {
    id: ContentSection;
    heading: string;
    title: string;
    description: string;
    intro: string;
    navLabel: string;
}

export const CONTENT_SECTIONS: ContentSectionMeta[] = [
    {
        id: "guides",
        heading: "Guides",
        title: "Streaming guides | ITZON",
        description: "Step by step guides for streaming on ITZON: OBS setup, private streams, and getting your channel running.",
        intro: "Everything you need to run a channel, written for streamers rather than developers.",
        navLabel: "Guides",
    },
    {
        id: "docs",
        heading: "Developer documentation",
        title: "Developer documentation | ITZON",
        description: "Developer documentation for ITZON: the public REST API, chat bots over IRC, and Sign in with itzon.",
        intro: "Reference documentation for building against ITZON. Every endpoint, token and error code.",
        navLabel: "API",
    },
];

export const CONTENT_PAGES: ContentPage[] = [
    {
        section: "guides",
        slug: "obs-setup",
        heading: "OBS setup",
        title: "How to stream with OBS Studio | ITZON",
        description: "Go live on ITZON with OBS Studio: find your ingest URL and stream key, choose encoder settings, and start your first broadcast.",
        summary: "From stream key to first broadcast, step by step.",
    },
    {
        section: "guides",
        slug: "private-streams",
        heading: "Private streams",
        title: "How to password protect a stream | ITZON",
        description: "Close an ITZON channel with a shared password so only viewers who know it can watch, and see exactly what closing a channel changes.",
        summary: "Close a channel with a shared password.",
    },
    {
        section: "guides",
        slug: "badges",
        heading: "Chat badges",
        title: "Every chat badge and how to get it | ITZON",
        description: "Every ITZON chat badge shown at three sizes, what each one means, and exactly how it is earned, bought or given by staff.",
        summary: "What every badge means and how each one is earned.",
    },
    {
        section: "docs",
        slug: "api",
        heading: "Public API",
        title: "Public API reference | ITZON",
        description: "The ITZON public REST API: channel status, followers, categories and stream info updates, with bearer tokens, scopes and rate limits.",
        summary: "Channel status, followers, categories and stream info updates over JSON.",
    },
    {
        section: "docs",
        slug: "chat-bots",
        heading: "Chat bots",
        title: "Chat bot API over IRC | ITZON",
        description: "Build a chat bot for ITZON over plain IRC or WebSocket: token auth, IRCv3 tags, moderation commands, rate limits and close codes.",
        summary: "Connect over IRC or WebSocket, read tags, run moderation commands.",
    },
    {
        section: "docs",
        slug: "oauth",
        heading: "Sign in with itzon",
        title: "Sign in with itzon, OAuth 2.0 | ITZON",
        description: "Add Sign in with itzon to your app: the OAuth 2.0 authorization code flow, scopes, token exchange, refresh rotation and error codes.",
        summary: "Verify a user's itzon identity and call the API on their behalf.",
    },
];

export function sectionMeta(id: ContentSection): ContentSectionMeta {
    const found = CONTENT_SECTIONS.find(section => section.id === id);
    if (!found) throw new Error(`unknown content section: ${id}`);
    return found;
}

export function pagesInSection(id: ContentSection): ContentPage[] {
    return CONTENT_PAGES.filter(page => page.section === id);
}

export function pageUrl(page: ContentPage): string {
    return `/${page.section}/${page.slug}`;
}

export function sectionUrl(id: ContentSection): string {
    return `/${id}`;
}
