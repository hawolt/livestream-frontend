import { ctx, isOwner } from "./context.ts";
import { hashColor } from "./text.ts";

export type Role = "op" | "staff" | "bot" | "mod";
export const roles = new Map<string, Role>();
export const vips = new Set<string>();
export const subscribers = new Set<string>();
export const unverified = new Set<string>();
export const guests = new Set<string>();
export const knownMembers = new Set<string>();
export const memberDisplay = new Map<string, string>();
export const colors = new Map<string, string>();

export function nickColor(from: string): string {
    const chosen = colors.get(from.toLowerCase());
    if (chosen) return chosen;
    return hashColor(from);
}

export function hasModRole(): boolean {
    if (isOwner(ctx.nick)) return true;
    const role = roles.get(ctx.nick.toLowerCase());
    return role === "staff" || role === "mod";
}

export function memberRankBucket(key: string): number {
    if (roles.get(key) === "staff") return 6;
    if (key === ctx.channel.slice(1)) return 5;
    if (roles.get(key) === "bot") return 4;
    if (roles.get(key) === "mod") return 3;
    if (vips.has(key)) return 2;
    if (guests.has(key)) return 0;
    return 1;
}

export const USERLIST_GROUPS: { label: string; bucket: number }[] = [
    { label: "Staff", bucket: 6 },
    { label: "Broadcaster", bucket: 5 },
    { label: "Bots", bucket: 4 },
    { label: "Moderators", bucket: 3 },
    { label: "VIPs", bucket: 2 },
    { label: "Users", bucket: 1 },
    { label: "Guests", bucket: 0 },
];

export interface DecodedNamePrefix {
    role: Role | null;
    vip: boolean;
    sub: boolean;
    unver: boolean;
    guest: boolean;
    name: string;
}

export function decodeNamePrefix(raw: string): DecodedNamePrefix {
    let i = 0;
    let role: Role | null = null;
    let vip = false;
    let sub = false;
    let unver = false;
    let guest = false;
    for (; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "@") role = "op";
        else if (ch === "%") role = "staff";
        else if (ch === "&") role = "bot";
        else if (ch === "+") role = "mod";
        else if (ch === "~") vip = true;
        else if (ch === "*") sub = true;
        else if (ch === "=") unver = true;
        else if (ch === "?") guest = true;
        else break;
    }
    return { role, vip, sub, unver, guest, name: raw.slice(i) };
}

export function applyNamesList(names: string): void {
    for (const raw of names.split(/\s+/)) {
        if (!raw) continue;
        const decoded = decodeNamePrefix(raw);
        if (!decoded.name) continue;
        const key = decoded.name.toLowerCase();
        knownMembers.add(key);
        memberDisplay.set(key, decoded.name);
        if (decoded.role) roles.set(key, decoded.role);
        else roles.delete(key);
        if (decoded.vip) vips.add(key);
        else vips.delete(key);
        if (decoded.sub) subscribers.add(key);
        else subscribers.delete(key);
        if (decoded.unver) unverified.add(key);
        else unverified.delete(key);
        if (decoded.guest) guests.add(key);
        else guests.delete(key);
    }
}

export function removeMember(key: string): void {
    if (!knownMembers.has(key)) return;
    knownMembers.delete(key);
    memberDisplay.delete(key);
    roles.delete(key);
    vips.delete(key);
    subscribers.delete(key);
    unverified.delete(key);
    guests.delete(key);
}
