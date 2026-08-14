export interface ProfilePanel {
    id: string;
    title: string;
    body: string;
    linkUrl: string;
    imageUrl: string;
}

function stringField(item: Record<string, unknown>, key: string): string {
    return typeof item[key] === "string" ? (item[key] as string) : "";
}

export function normalizePanels(raw: unknown): ProfilePanel[] {
    if (!Array.isArray(raw)) return [];
    const out: ProfilePanel[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== "object") continue;
        const item = entry as Record<string, unknown>;
        const panel: ProfilePanel = {
            id: stringField(item, "id"),
            title: stringField(item, "title"),
            body: stringField(item, "body"),
            linkUrl: stringField(item, "linkUrl"),
            imageUrl: stringField(item, "imageUrl"),
        };
        if (!panel.title && !panel.body && !panel.imageUrl) continue;
        out.push(panel);
    }
    return out;
}

export function isSafeHttpLink(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
}
