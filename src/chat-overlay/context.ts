import { ChatEmoteCatalog } from "../chat-emotes.ts";

export const msgsEl = document.getElementById("chat-messages") as HTMLElement;

export const EMOTE_SET_URL = "https://7tv.io/v3/emote-sets/global";
export const MAX_MESSAGES = 100;
export const RETRY_MS = 5000;
export const BAN_RETRY_MS = 30000;
export const RENDERED_BODY_CLASS = "rendered-emote-body";

export const emotes = new ChatEmoteCatalog();

export type Role = "op" | "staff" | "bot" | "mod";
export const roles = new Map<string, Role>();
export const vips = new Set<string>();
export const partners = new Set<string>();
export const subscribers = new Set<string>();
export const subscriberBadges = new Map<string, string>();
export const colors = new Map<string, string>();
export const unverified = new Set<string>();
export const knownMembers = new Set<string>();

export const ctx = {
    channel: "",
    channelEmoteTwitchId: "",
    nick: "",
    joined: false,
    sock: null as WebSocket | null,
    retryTimer: null as number | null,
    banRetry: false,
    showBadges: true,
    showEmotes: true,
    showSystem: false,
    fadeMs: 0,
    demoMode: false,
};

export function isOwner(from: string): boolean {
    return from.toLowerCase() === ctx.channel.slice(1);
}
