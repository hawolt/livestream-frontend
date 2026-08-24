export type WatchSurface = "channel" | "clip" | "embed";

export function watchBeaconActive(paused: boolean, ended: boolean, visibilityState: string): boolean {
    return !paused && !ended && visibilityState === "visible";
}

export function watchBeaconStartsRun(runChannel: string | null, channel: string): boolean {
    return runChannel !== channel;
}

export function watchBeaconBody(channel: string, surface: WatchSurface, start: boolean): string {
    return JSON.stringify({ channel, surface, start });
}
