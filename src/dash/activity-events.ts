export interface FollowEvent {
    type: string;
    username: string;
    at: number;
}

export function followEventKey(event: FollowEvent): string {
    return `${event.type}\u0000${event.username.toLowerCase()}\u0000${event.at}`;
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
