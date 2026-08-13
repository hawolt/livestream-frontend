import type { EmbedPlaybackState, EmbedTransportKind } from "./context.ts";

export type EmbedHealthRestartReason = "stuck-connecting" | "stale-media" | "stale-progress";

export interface EmbedHealthInput {
    state: EmbedPlaybackState;
    transportKind: EmbedTransportKind;
    now: number;
    lastStateChangeAt: number;
    lastMediaArrivalAt: number;
    lastProgressAt: number;
    paused: boolean;
    staleMs: number;
    stuckMs: number;
}

export function decideEmbedHealth(input: EmbedHealthInput): EmbedHealthRestartReason | null {
    if (input.state === "connecting") {
        return input.now - input.lastStateChangeAt > input.stuckMs ? "stuck-connecting" : null;
    }
    if (input.state !== "playing") return null;
    if (input.transportKind === "ws" && input.now - input.lastMediaArrivalAt > input.staleMs) {
        return "stale-media";
    }
    if (!input.paused && input.now - input.lastProgressAt > input.staleMs) return "stale-progress";
    return null;
}
