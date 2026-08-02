import { ctx } from "./context.ts";
import { createPollLoop } from "./poll-loop.ts";
import { render } from "./render.ts";
import { parseExploreData, type ExploreData } from "./response.ts";
import { showEmpty } from "./stream-cards.ts";

const POLL_DELAY_MS = 20_000;
const RETRY_DELAY_MS = 5_000;

async function requestExplore(signal: AbortSignal): Promise<ExploreData> {
    const res = await fetch("/api/live/explore", { signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Explore request failed with ${res.status}`);
    return parseExploreData(await res.json() as unknown);
}

const pollLoop = createPollLoop({
    request: requestExplore,
    apply(data): void {
        ctx.streams = data.streams;
        ctx.categories = data.categories;
        if (data.mediaBase !== undefined) ctx.mediaBase = data.mediaBase.replace(/\/+$/, "");
        render();
    },
    onInitialError(): void {
        showEmpty("Could not load live streams. Retrying...");
    },
    schedule(run, delayMs): number {
        return window.setTimeout(run, delayMs);
    },
    cancel(handle): void {
        window.clearTimeout(handle as number);
    },
    pollDelayMs: POLL_DELAY_MS,
    retryDelayMs: RETRY_DELAY_MS,
});

export function startExplorePolling(): void {
    pollLoop.start();
}

export function stopExplorePolling(): void {
    pollLoop.stop();
}
