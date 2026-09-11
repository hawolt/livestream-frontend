export type PlayerState = "offline" | "connecting" | "buffering" | "playing" | "reconnecting";
export type TransportKind = "none" | "hls-native" | "hls-js" | "unsupported";

export const ctx = {
    gen: 0,
    state: "offline" as PlayerState,
    terminal: false,
    transportKind: "none" as TransportKind,

    startedOnce: false,
    pauseSuspended: false,

    behindLive: false,

    genCleanup: [] as Array<() => void>,

    lastProgressAt: 0,
    lastObservedTime: -1,
    lastStateChangeAt: 0,

    mediaBase: "",
    edgeServed: false,
    lowLatencyEntitled: false,
    username: "",
    displayUsername: "",
    clipsDisabled: false,
    clipMode: false,
};

export function nextGen(): number {
    ctx.gen += 1;
    return ctx.gen;
}

export function isCurrent(g: number): boolean {
    return g === ctx.gen && !ctx.terminal;
}

export function track(cleanup: () => void): void {
    ctx.genCleanup.push(cleanup);
}

export function runGenCleanup(): void {
    const fns = ctx.genCleanup;
    ctx.genCleanup = [];
    for (const fn of fns) {
        try {
            fn();
        } catch {}
    }
}
