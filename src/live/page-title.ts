const MAX_TITLE_CHARS = 65;

export function channelPageTitle(displayUsername: string, streamTitle?: string | null): string {
    const name = displayUsername.trim();
    const suffix = " | ITZON";
    const stream = (streamTitle ?? "").trim();
    if (name === "") return "ITZON";
    if (stream === "") return `${name}${suffix}`;
    const full = `${name} - ${stream}${suffix}`;
    if (full.length <= MAX_TITLE_CHARS) return full;
    const room = MAX_TITLE_CHARS - name.length - 3 - suffix.length;
    if (room < 12) return `${name}${suffix}`;
    return `${name} - ${stream.slice(0, room - 3).trimEnd()}...${suffix}`;
}

export function clipPageTitle(channel: string, clipTitle?: string | null): string {
    const name = channel.trim();
    const clip = (clipTitle ?? "").trim();
    if (clip === "") return name === "" ? "Clip | ITZON" : `${name} clip | ITZON`;
    return channelPageTitle(clip, name === "" ? null : `clip by ${name}`);
}

export function chatPopoutTitle(displayUsername: string): string {
    const name = displayUsername.trim();
    return name === "" ? "Chat | ITZON" : `${name} chat | ITZON`;
}
