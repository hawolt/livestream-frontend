import { ctx } from "./context.ts";
import { render } from "./render.ts";
import { parseExploreData } from "./response.ts";

export async function loadExplore(): Promise<void> {
    try {
        const res = await fetch("/api/live/explore");
        if (!res.ok) return;
        const raw = await res.json();
        const hadData = ctx.streams.length > 0 || ctx.categories.length > 0;
        try {
            const data = parseExploreData(raw);
            ctx.streams = data.streams;
            ctx.categories = data.categories;
            if (typeof data.mediaBase === "string") ctx.mediaBase = data.mediaBase.replace(/\/+$/, "");
        } catch {
            if (hadData) return;
        }
        render();
    } catch {}
}
