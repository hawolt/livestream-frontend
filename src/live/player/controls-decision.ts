import type { PlayerState } from "./context.ts";

export function hidePlayerControls(state: PlayerState, clipMode: boolean): boolean {
    return state === "offline" && !clipMode;
}
