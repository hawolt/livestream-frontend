export interface FollowEvent {
    type: string;
    username: string;
    at: number;
    viewers?: number;
    reason?: string;
    detail?: string;
}

export function rejectEventLabel(event: FollowEvent): string {
    if (event.detail && event.detail.trim()) return event.detail.trim();
    if (event.reason && event.reason.trim()) return `Stream rejected: ${event.reason.trim()}`;
    return "Stream rejected";
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

export function countNewFollowerEvents(snapshot: FollowEvent[], live: FollowEvent[]): number {
    return countNewLiveEvents(snapshot, live.filter(event => event.type === "follow"));
}

export function eventTypeClass(type: string): string {
    const key = type.toLowerCase().replace(/[^a-z0-9]/g, "");
    return key ? `act-ev-type act-ev-type-${key}` : "act-ev-type";
}

export function isStreamEvent(type: string): boolean {
    return type === "reject" || type === "warn";
}

export function eventTypeLabel(type: string): string {
    if (isStreamEvent(type)) return "STREAM";
    if (type === "points.redeem") return "REDEEM";
    return type.toUpperCase();
}

export function eventTextLabel(e: FollowEvent): string {
    if (e.type === "raid" && typeof e.viewers === "number") {
        return `${e.username} with ${e.viewers} ${e.viewers === 1 ? "viewer" : "viewers"}`;
    }
    if (isStreamEvent(e.type)) return rejectEventLabel(e);
    if (e.type === "points.redeem") return `${e.username} redeemed ${e.detail?.trim() || "a reward"}`;
    return e.username;
}

export function viewerCountLabel(viewers: number | null, live: boolean | null): string {
    if (viewers === null) return "-";
    if (live === false) return "Offline";
    if (viewers === 0) return live === true ? "0" : "Offline";
    return String(viewers);
}
