import type { EmbedPlaybackState } from "./context.ts";

export type EmbedHealthRestartReason = "stuck-connecting" | "stale-progress";

export interface EmbedHealthInput {
    state: EmbedPlaybackState;
    now: number;
    lastStateChangeAt: number;
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
    if (!input.paused && input.now - input.lastProgressAt > input.staleMs) return "stale-progress";
    return null;
}
