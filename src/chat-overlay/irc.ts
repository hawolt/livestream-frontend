export type BadgeRole = "staff" | "bot" | "mod";
const BADGE_ROLES: BadgeRole[] = ["staff", "bot", "mod"];

export interface IrcLine {
    nick: string;
    command: string;
    params: string[];
    msgid?: string;
    subBadge?: string;
    partner?: boolean;
    color?: string;
    role?: BadgeRole;
    vip?: boolean;
    unverified?: boolean;
}

export function parse(line: string): IrcLine | null {
    let rest = line;
    let from = "";
    let msgid: string | undefined;
    let subBadge: string | undefined;
    let partner = false;
    let color: string | undefined;
    let role: BadgeRole | undefined;
    let vip = false;
    let unverified = false;
    if (rest.startsWith("@")) {
        const sp = rest.indexOf(" ");
        if (sp < 0) return null;
        for (const tag of rest.slice(1, sp).split(";")) {
            const eq = tag.indexOf("=");
            const key = eq > 0 ? tag.slice(0, eq) : tag;
            const val = eq > 0 ? tag.slice(eq + 1) : "";
            if (key === "msgid") msgid = val;
            else if (key === "sub-badge") subBadge = val;
            else if (key === "partner") partner = val === "1";
            else if (key === "color") color = val;
            else if (key === "role") role = BADGE_ROLES.includes(val as BadgeRole) ? (val as BadgeRole) : undefined;
            else if (key === "vip") vip = val === "1";
            else if (key === "unverified") unverified = val === "1";
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
    if (subBadge) out.subBadge = subBadge;
    if (partner) out.partner = true;
    if (color !== undefined) out.color = color;
    if (role) out.role = role;
    if (vip) out.vip = true;
    if (unverified) out.unverified = true;
    return out;
}
