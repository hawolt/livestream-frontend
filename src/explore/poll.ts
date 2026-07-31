import { ctx } from "./context.ts";
import { render } from "./render.ts";

export async function loadExplore(): Promise<void> {
    try {
        const res = await fetch("/api/live/explore");
        if (res.ok) {
            const data = await res.json();
            ctx.streams = Array.isArray(data.streams) ? data.streams : [];
            ctx.categories = Array.isArray(data.categories) ? data.categories : [];
            if (typeof data.mediaBase === "string") ctx.mediaBase = data.mediaBase.replace(/\/+$/, "");
            render();
        }
    } catch {}
}
