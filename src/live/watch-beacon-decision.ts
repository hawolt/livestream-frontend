export function watchBeaconActive(paused: boolean, ended: boolean, visibilityState: string): boolean {
    return !paused && !ended && visibilityState === "visible";
}
