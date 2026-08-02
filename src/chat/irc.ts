export interface IrcLine {
    nick: string;
    command: string;
    params: string[];
    msgid?: string;
    reply?: string;
    color?: string;
    subBadge?: string;
    time?: string;
    automod?: boolean;
    userId?: string;
    avatar?: string;
}

export function parse(line: string): IrcLine | null {
    let rest = line;
    let from = "";
    let msgid: string | undefined;
    let reply: string | undefined;
    let color: string | undefined;
    let subBadge: string | undefined;
    let time: string | undefined;
    let automod = false;
    let userId: string | undefined;
    let avatar: string | undefined;
    if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        for (const tag of rest.slice(1, sp).split(";")) {
            const eq = tag.indexOf("=");
            const key = eq > 0 ? tag.slice(0, eq) : tag;
            const val = eq > 0 ? tag.slice(eq + 1) : "";
            if (key === "msgid") msgid = val;
            else if (key === "+reply") reply = val;
            else if (key === "color") color = val;
            else if (key === "sub-badge") subBadge = val;
            else if (key === "time") time = val;
            else if (key === "automod") automod = true;
            else if (key === "user-id") userId = val;
            else if (key === "avatar") avatar = val;
        }
        rest = rest.slice(sp + 1);
    }
    if (rest.startsWith(":")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        const prefix = rest.slice(1, sp);
        const bang = prefix.indexOf("!");
        from = bang < 0 ? prefix : prefix.slice(0, bang);
        rest = rest.slice(sp + 1);
    }
    const params: string[] = [];
    while (rest.length > 0) {
        if (rest.startsWith(":")) {
            params.push(rest.slice(1));
            break;
        }
        const sp = rest.indexOf(" ");
        if (sp < 0) {
            params.push(rest);
            break;
        }
        params.push(rest.slice(0, sp));
        rest = rest.slice(sp + 1);
    }
    const command = params.shift();
    if (!command) return null;
    const out: IrcLine = { nick: from, command: command.toUpperCase(), params };
    if (msgid) out.msgid = msgid;
    if (reply) out.reply = reply;
    if (color !== undefined) out.color = color;
    if (subBadge !== undefined) out.subBadge = subBadge;
    if (time) out.time = time;
    if (automod) out.automod = true;
    if (userId) out.userId = userId;
    if (avatar) out.avatar = avatar;
    return out;
}
