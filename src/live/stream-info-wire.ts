export interface StreamInfoFrame {
    title: string;
    category: string;
    categoryId: number | null;
    language: string;
}

export function parseStreamInfoFrame(msg: unknown): StreamInfoFrame | null {
    if (!msg || typeof msg !== "object") return null;
    const m = msg as Record<string, unknown>;
    if (m.type !== "stream-info") return null;
    return {
        title: typeof m.title === "string" ? m.title : "",
        category: typeof m.category === "string" ? m.category : "",
        categoryId: typeof m.categoryId === "number" ? m.categoryId : null,
        language: typeof m.language === "string" ? m.language : "und",
    };
}
