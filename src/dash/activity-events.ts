export interface FollowEvent {
    type: string;
    username: string;
    at: number;
    viewers?: number;
}

export function followEventKey(event: FollowEvent): string {
    return `${event.type}\0${event.username.toLowerCase()}\0${event.at}`;
}

export function mergeFollowEvents(snapshot: FollowEvent[], live: FollowEvent[], limit: number): FollowEvent[] {
    const unique = new Map<string, FollowEvent>();
    for (const event of snapshot) unique.set(followEventKey(event), event);
    for (const event of live) unique.set(followEventKey(event), event);
    return Array.from(unique.values()).sort((a, b) => b.at - a.at).slice(0, limit);
}

export function countNewLiveEvents(snapshot: FollowEvent[], live: FollowEvent[]): number {
    const snapshotKeys = new Set(snapshot.map(followEventKey));
    return new Set(live.filter(event => !snapshotKeys.has(followEventKey(event))).map(followEventKey)).size;
}

export function eventTypeClass(type: string): string {
    const key = type.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key ? `act-ev-type act-ev-type-${key}` : "act-ev-type";
}

export function viewerCountLabel(viewers: number | null, live: boolean | null): string {
    if (viewers === null) return "-";
    if (live === false) return "Offline";
    if (viewers === 0) return live === true ? "0" : "Offline";
    return String(viewers);
}
