import { readLocalStorage } from "../../storage.ts";
import { QUALITY_AUTO, QUALITY_SOURCE } from "../../quality.ts";
import { PRUNE_KEEP_S, QUALITY_STORAGE_KEY } from "../constants.ts";
import type { AdoptedTransport } from "./adoption.ts";

export type PlayerState = "offline" | "connecting" | "buffering" | "playing" | "reconnecting";

const storedQualityPreference = readLocalStorage(QUALITY_STORAGE_KEY);
const initialQualityPreference = !storedQualityPreference || storedQualityPreference === QUALITY_AUTO
    ? QUALITY_SOURCE
    : storedQualityPreference;

export const ctx = {
    gen: 0,
    state: "offline" as PlayerState,
    terminal: false,
    transportKind: "none" as "ws" | "hls" | "none",

    ws: null as WebSocket | null,
    adopt: null as AdoptedTransport | null,
    mediaSource: null as MediaSource | null,
    sourceBuffer: null as SourceBuffer | null,
    appendQueue: [] as ArrayBuffer[],
    objectUrl: null as string | null,
    startedPlayback: false,
    overflowReconnects: 0,
    startedOnce: false,

    behindLive: false,
    quotaKeepS: PRUNE_KEEP_S,
    quotaFailStreak: 0,

    qualityLadder: [] as string[],
    qualityLadderKnown: false,
    qualityPreference: initialQualityPreference as string,
    activeQuality: QUALITY_SOURCE as string,
    requestedQuality: QUALITY_SOURCE as string,

    genCleanup: [] as Array<() => void>,

    lastMediaArrivalAt: 0,
    lastProgressAt: 0,
    lastObservedTime: -1,
    lastStateChangeAt: 0,

    mediaBase: "",
    wssBase: "",
    username: "",
    displayUsername: "",
    clipsDisabled: false,
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
