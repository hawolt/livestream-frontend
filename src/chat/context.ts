import { ChatEmoteCatalog } from "../chat-emotes.ts";
import type { ReplaceRange } from "./suggest-match.ts";
import type { SuggestItem } from "./suggest-match.ts";

export interface ReplyTarget {
    msgid: string;
    from: string;
    text: string;
}

export const emotes = new ChatEmoteCatalog();

export const ctx = {
    sock: null as WebSocket | null,
    channel: "",
    nick: "",
    joined: false,
    banned: false,
    isAccount: false,
    retryTimer: null as number | null,
    banRetry: false,
    destroyed: false,
    pickerOpen: false,
    capEcho: false,
    capRedact: false,
    pendingCapRequests: 0,
    pageGuestNick: "",
    accountStatusRevision: 0,
    accountStatusTimer: null as number | null,
    accountStatusRequest: null as Promise<void> | null,
    accountStatusResolved: false,
    accountSessionToken: "",
    requestLogin: null as (() => void) | null,
    channelEmoteTwitchId: "",
    userlistOpen: false,
    helpOpen: false,
    helpBuilt: false,
    settingsOpen: false,
    suggestIndex: -1,
    suggestItemsData: [] as SuggestItem[],
    tabCycleRange: null as ReplaceRange | null,
    replyTo: null as ReplyTarget | null,
};

export function myNickLower(): string {
    return ctx.nick.toLowerCase();
}

export function isOwner(from: string): boolean {
    return from.toLowerCase() === ctx.channel.slice(1);
}
