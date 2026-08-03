import { textMentionsUsername } from "./text.ts";

export interface MentionPingInput {
    text: string;
    from: string;
    myUsername: string;
    signedIn: boolean;
    live: boolean;
}

export function shouldPingForMention(input: MentionPingInput): boolean {
    if (!input.signedIn) return false;
    if (!input.live) return false;
    if (!input.myUsername) return false;
    if (input.from.toLowerCase() === input.myUsername.toLowerCase()) return false;
    return textMentionsUsername(input.text, input.myUsername);
}
