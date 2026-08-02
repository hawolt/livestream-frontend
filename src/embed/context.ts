export const previewMode = new URLSearchParams(location.search).get("preview") === "1";

export const ctx = {
    username: "",
    mediaBase: "",
    transportKind: "none" as "ws" | "hls" | "none",

    gen: 0,
    terminal: false,
    offline: true,

    ws: null as WebSocket | null,
    mediaSource: null as MediaSource | null,
    sourceBuffer: null as SourceBuffer | null,
    appendQueue: [] as ArrayBuffer[],
    objectUrl: null as string | null,
    startedPlayback: false,
    hlsVideoCleanup: null as (() => void) | null,
};

export function nextGen(): number {
    ctx.gen += 1;
    return ctx.gen;
}

export function isCurrent(g: number): boolean {
    return g === ctx.gen && !ctx.terminal;
}
