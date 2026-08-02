import { ctx, emotes, roles, vips } from "./context.ts";
import { addMessage } from "./render.ts";

const DEMO_STAFF = "sentinel";
const DEMO_MOD = "riverside";
const DEMO_VIP = "emberly";
const DEMO_GUEST = "guest_8f3a91c2";
const DEMO_USER = "kestrel";
const DEMO_EMOTE_USER = "pixelfox";
const DEMO_LONG_USER = "northwind";
const DEMO_INTERVAL_MS = 1500;

function demoEmoteToken(): string {
    if (emotes.size > 0) return emotes.names().next().value as string;
    return "nice";
}

function demoScript(): [string, string][] {
    return [
        [DEMO_STAFF, "welcome to the stream, chat!"],
        [ctx.channel.slice(1), "hey everyone, good to see you"],
        [DEMO_MOD, "reminder: keep it friendly in here"],
        [DEMO_VIP, "been here since day one, love it"],
        [DEMO_GUEST, "first time here, loving the stream so far"],
        [DEMO_USER, "let's gooo"],
        [DEMO_EMOTE_USER, `${demoEmoteToken()} that play was insane`],
        [DEMO_LONG_USER, "this is a much longer message meant to show how the overlay wraps text across multiple lines once a viewer writes something more substantial than a quick reaction"],
    ];
}

export function startDemo(): void {
    roles.set(DEMO_STAFF.toLowerCase(), "staff");
    roles.set(DEMO_MOD.toLowerCase(), "mod");
    vips.add(DEMO_VIP.toLowerCase());
    let i = 0;
    const step = (): void => {
        const script = demoScript();
        const [from, text] = script[i % script.length]!;
        addMessage(from, text);
        i++;
    };
    step();
    window.setInterval(step, DEMO_INTERVAL_MS);
}
