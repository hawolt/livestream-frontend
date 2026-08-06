import type { ExploreCategory, ExploreStream } from "./context.ts";

export interface ExploreData {
    streams: ExploreStream[];
    categories: ExploreCategory[];
    mediaBase?: string;
}

function streamFrom(value: unknown): ExploreStream | null {
    if (!value || typeof value !== "object") return null;
    const stream = value as Record<string, unknown>;
    const username = typeof stream["username"] === "string" ? stream["username"].trim() : "";
    if (!username) return null;
    return {
        username,
        title: typeof stream["title"] === "string" ? stream["title"] : "",
        category: typeof stream["category"] === "string" ? stream["category"] : null,
        categoryId: typeof stream["categoryId"] === "number" && Number.isFinite(stream["categoryId"])
            ? stream["categoryId"]
            : null,
        language: typeof stream["language"] === "string" ? stream["language"] : "und",
        viewers: typeof stream["viewers"] === "number" && Number.isFinite(stream["viewers"])
            ? Math.max(0, Math.floor(stream["viewers"]))
            : 0,
        mediaBase: typeof stream["mediaBase"] === "string" ? stream["mediaBase"] : undefined,
        thumbnail: typeof stream["thumbnail"] === "string" && stream["thumbnail"].startsWith("/")
            ? stream["thumbnail"]
            : undefined,
    };
}

function categoryFrom(value: unknown): ExploreCategory | null {
    if (!value || typeof value !== "object") return null;
    const category = value as Record<string, unknown>;
    if (typeof category["id"] !== "number" || !Number.isFinite(category["id"])) return null;
    if (typeof category["name"] !== "string" || !category["name"].trim()) return null;
    return {
        id: category["id"],
        name: category["name"].trim(),
        liveStreamCount: typeof category["liveStreamCount"] === "number" && Number.isFinite(category["liveStreamCount"])
            ? Math.max(0, Math.floor(category["liveStreamCount"]))
            : 0,
        viewerCount: typeof category["viewerCount"] === "number" && Number.isFinite(category["viewerCount"])
            ? Math.max(0, Math.floor(category["viewerCount"]))
            : 0,
        imageUrl: typeof category["imageUrl"] === "string" ? category["imageUrl"] : null,
    };
}

export function parseExploreData(raw: unknown): ExploreData {
    if (!raw || typeof raw !== "object") throw new Error("Explore response is not an object");
    const data = raw as Record<string, unknown>;
    if (!Array.isArray(data["streams"]) || !Array.isArray(data["categories"])) {
        throw new Error("Explore response is missing collections");
    }
    const streams = data["streams"].map(streamFrom).filter((stream): stream is ExploreStream => stream !== null);
    const categories = data["categories"].map(categoryFrom).filter((category): category is ExploreCategory => category !== null);
    if (data["streams"].length > 0 && streams.length === 0) throw new Error("Explore streams are malformed");
    if (data["categories"].length > 0 && categories.length === 0) throw new Error("Explore categories are malformed");
    return {
        streams,
        categories,
        mediaBase: typeof data["mediaBase"] === "string" ? data["mediaBase"] : undefined,
    };
}
