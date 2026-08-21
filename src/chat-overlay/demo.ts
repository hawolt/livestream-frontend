import { ctx, emotes, roles, vips } from "./context.ts";
import { addMessage, addSystemMessage } from "./render.ts";

const DEMO_STAFF = "sentinel";
const DEMO_MOD = "riverside";
const DEMO_VIP = "emberly";
const DEMO_GUEST = "guest_8f3a91c2";
const DEMO_USER = "kestrel";
const DEMO_EMOTE_USER = "pixelfox";
const DEMO_LONG_USER = "northwind";
const DEMO_INTERVAL_MS = 1500;
const DEMO_SYSTEM_TEXT = "kestrel redeemed Highlight my message";

type DemoEntry = ["chat", string, string] | ["system", string];

function demoEmoteToken(): string {
    if (emotes.size > 0) return emotes.names().next().value as string;
    return "nice";
}

function demoScript(): DemoEntry[] {
    const entries: DemoEntry[] = [
        ["chat", DEMO_STAFF, "welcome to the stream, chat!"],
        ["chat", ctx.channel.slice(1), "hey everyone, good to see you"],
        ["chat", DEMO_MOD, "reminder: keep it friendly in here"],
        ["chat", DEMO_VIP, "been here since day one, love it"],
        ["chat", DEMO_GUEST, "first time here, loving the stream so far"],
        ["chat", DEMO_USER, "let's gooo"],
        ["chat", DEMO_EMOTE_USER, `${demoEmoteToken()} that play was insane`],
        ["chat", DEMO_LONG_USER, "this is a much longer message meant to show how the overlay wraps text across multiple lines once a viewer writes something more substantial than a quick reaction"],
    ];
    if (ctx.showSystem) entries.splice(4, 0, ["system", DEMO_SYSTEM_TEXT]);
    return entries;
}

export function startDemo(): void {
    roles.set(DEMO_STAFF.toLowerCase(), "staff");
    roles.set(DEMO_MOD.toLowerCase(), "mod");
    vips.add(DEMO_VIP.toLowerCase());
    let i = 0;
    const step = (): void => {
        const script = demoScript();
        const entry = script[i % script.length]!;
        if (entry[0] === "system") addSystemMessage(entry[1]);
        else addMessage(entry[1], entry[2]);
        i++;
    };
    step();
    window.setInterval(step, DEMO_INTERVAL_MS);
}
