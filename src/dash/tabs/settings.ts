import type { AccountSettings } from "../../api.ts";
import { $, getMe, setToken, authFetch } from "../core.ts";

let usernameCooldownRemaining = 0;

function updateUsernameSaveState(): void {
    const saveBtn = document.getElementById("btn-username-save") as HTMLButtonElement | null;
    const current = (document.getElementById("st-username-current") as HTMLInputElement | null)?.value.trim() ?? "";
    const next = (document.getElementById("st-username-new") as HTMLInputElement | null)?.value.trim() ?? "";
    const capitalizationOnly = next !== current && next.toLowerCase() === current.toLowerCase();
    if (saveBtn) saveBtn.disabled = usernameCooldownRemaining > 0 && !capitalizationOnly;
}

function formatUsernameHint(s: AccountSettings): void {
    const hint = document.getElementById("st-username-hint");
    const remaining = s.usernameCooldownRemaining ?? 0;
    usernameCooldownRemaining = remaining;
    if (hint) {
        if (remaining > 0) {
            const days = Math.ceil(remaining / 86400);
            const next = new Date(Date.now() + remaining * 1000).toLocaleDateString();
            hint.textContent = `You can change your username once every 30 days (capitalization-only changes are always allowed). Next change available in ${days} day${days === 1 ? "" : "s"} (${next}).`;
        } else {
            hint.textContent = "You can change your username once every 30 days. Changing only the capitalization is always allowed.";
        }
    }
    updateUsernameSaveState();
}

async function loadSettings(): Promise<void> {
    try {
        const s = await authFetch<AccountSettings>("/api/settings");
        ($("st-email") as HTMLInputElement).value = s.email ?? "";
        const banner = document.getElementById("settings-verify-banner");
        if (banner) banner.style.display = s.emailVerified === false ? "" : "none";
        applyChatColor(s.chatColor);
        const usernameCurrent = document.getElementById("st-username-current") as HTMLInputElement | null;
        if (usernameCurrent) usernameCurrent.value = s.username ?? getMe()?.username ?? "";
        formatUsernameHint(s);
        renderBotCard(typeof s.chatBotToken === "string" ? s.chatBotToken : null);
    } catch { }
}

function maskToken(t: string): string {
    return t.slice(0, 4) + "\u2022".repeat(12) + t.slice(-4);
}

function renderBotCard(token: string | null): void {
    const el = document.getElementById("st-bot-body");
    if (!el) return;
    el.replaceChildren();
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
    if (!token) {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = "Generate token";
        btn.addEventListener("click", () => void rotateBotToken(btn, false));
        row.append(btn);
        el.append(row);
        return;
    }
    const code = document.createElement("code");
    code.style.cssText = "font-size:11px;word-break:break-all";
    code.textContent = maskToken(token);
    let revealed = false;
    const revealBtn = document.createElement("button");
    revealBtn.className = "btn btn-sm";
    revealBtn.textContent = "Reveal";
    revealBtn.addEventListener("click", () => {
        revealed = !revealed;
        code.textContent = revealed ? token : maskToken(token);
        revealBtn.textContent = revealed ? "Hide" : "Reveal";
    });
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-sm";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
        void navigator.clipboard.writeText(token).then(() => {
            copyBtn.textContent = "Copied";
            setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
        }).catch(() => { copyBtn.textContent = "Failed"; });
    });
    const rotateBtn = document.createElement("button");
    rotateBtn.className = "btn btn-sm";
    rotateBtn.textContent = "Rotate";
    rotateBtn.addEventListener("click", () => void rotateBotToken(rotateBtn, true));
    row.append(code, revealBtn, copyBtn, rotateBtn);

    const help = document.createElement("div");
    help.style.cssText = "font-size:12px;color:var(--muted);margin-top:10px;line-height:1.7";
    const lines = [
        `IRC over TCP: ${location.host} port 6667, or WebSocket: wss://${location.host}/ws/irc (one IRC line per text frame)`,
        "Log in with PASS <token> before NICK/USER; the server assigns your account name regardless of the NICK you send.",
        "Then JOIN #channel and PRIVMSG #channel :message. Reply to server PING with PONG or the connection drops.",
    ];
    for (const l of lines) {
        const d = document.createElement("div");
        d.textContent = l;
        help.append(d);
    }
    el.append(row, help);
}

async function rotateBotToken(btn: HTMLButtonElement, confirmFirst: boolean): Promise<void> {
    if (confirmFirst && !confirm("Rotate the bot token? Connected bots are disconnected within about 90 seconds and the old token stops working.")) return;
    btn.disabled = true;
    try {
        const res = await authFetch<{ chatBotToken: string }>("/api/settings/chat-bot-token/rotate", { method: "POST" });
        renderBotCard(res.chatBotToken);
    } catch (e) {
        alert("Failed: " + (e instanceof Error ? e.message : String(e)));
        btn.disabled = false;
    }
}

function syncColorPreview(): void {
    const input = document.getElementById("st-chat-color") as HTMLInputElement | null;
    const preview = document.getElementById("st-color-preview");
    const me = getMe();
    if (preview && input) {
        preview.style.color = input.value;
        preview.textContent = me?.username ?? "username";
    }
}

function applyChatColor(color: unknown): void {
    const input = document.getElementById("st-chat-color") as HTMLInputElement | null;
    if (!input) return;
    input.value = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
        ? color
        : input.defaultValue;
    syncColorPreview();
}

export function init(): void {
    const me = getMe();
    const flags = new Set((me?.flags ?? "").split(",").map(f => f.trim()).filter(Boolean));
    const pendingBanner = document.getElementById("settings-pending-banner");
    if (pendingBanner) {
        pendingBanner.style.display = (me?.kind === "user" && flags.size === 0) ? "" : "none";
    }

    document.getElementById("btn-resend-verify")?.addEventListener("click", async () => {
        const btn    = document.getElementById("btn-resend-verify") as HTMLButtonElement;
        const result = document.getElementById("resend-result")!;
        btn.disabled = true;
        result.textContent = "Sending…";
        result.style.color = "var(--muted)";
        try {
            await authFetch("/api/auth/resend-verification", { method: "POST", body: "{}" });
            result.textContent = "Verification email sent, check your inbox.";
            result.style.color = "var(--green)";
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            result.textContent = msg;
            result.style.color = msg.toLowerCase().includes("wait") ? "var(--muted)" : "var(--red)";
        } finally { btn.disabled = false; }
    });

    document.getElementById("settings-account-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = ($("st-email") as HTMLInputElement).value.trim();
        const body: Record<string, string> = { email };
        try {
            const res = await authFetch<{ ok: boolean; emailVerified?: boolean; message?: string }>(
                "/api/settings", { method: "PUT", body: JSON.stringify(body) });
            const saved = $("st-saved");

            if (res.emailVerified === false) {
                const banner = document.getElementById("settings-verify-banner");
                if (banner) banner.style.display = "";
                saved.textContent = res.message ?? "Saved, check your inbox to verify your new email.";
            } else {
                saved.textContent = "Saved";
            }
            setTimeout(() => { saved.textContent = ""; }, 4000);
        } catch (err) { alert(`Save failed: ${err}`); }
    });

    document.getElementById("st-chat-color")?.addEventListener("input", syncColorPreview);
    document.getElementById("st-username-new")?.addEventListener("input", updateUsernameSaveState);

    async function saveChatColor(color: string | null): Promise<void> {
        const saved = document.getElementById("st-color-saved");
        try {
            await authFetch("/api/settings/chat-color", { method: "PUT", body: JSON.stringify({ color: color ?? "" }) });
            if (color === null) applyChatColor(null);
            if (saved) { saved.textContent = color ? "Saved" : "Reset to default"; saved.style.color = "var(--success)"; }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (saved) { saved.textContent = msg; saved.style.color = "var(--red)"; }
        }
        if (saved) setTimeout(() => { saved.textContent = ""; }, 3000);
    }

    document.getElementById("settings-color-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void saveChatColor((document.getElementById("st-chat-color") as HTMLInputElement).value);
    });
    document.getElementById("btn-color-reset")?.addEventListener("click", () => void saveChatColor(null));

    document.getElementById("settings-username-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = ($("st-username-new") as HTMLInputElement).value.trim();
        const password = ($("st-username-password") as HTMLInputElement).value;
        const status   = $("st-username-saved");
        if (!username || !password) {
            status.textContent = "Enter a new username and your current password.";
            status.style.color = "var(--red)";
            return;
        }
        try {
            const res = await authFetch<{ token: string; username: string }>(
                "/api/settings/username", { method: "PUT", body: JSON.stringify({ username, password }) });
            setToken(res.token);
            const me = getMe();
            if (me) me.username = res.username;
            ($("st-username-current") as HTMLInputElement).value = res.username;
            ($("st-username-new") as HTMLInputElement).value = "";
            ($("st-username-password") as HTMLInputElement).value = "";
            updateUsernameSaveState();
            status.textContent = "Saved";
            status.style.color = "var(--success)";
            setTimeout(() => { status.textContent = ""; }, 2500);
            void loadSettings();
        } catch (err) {
            const msg    = err instanceof Error ? err.message : String(err);
            const status_ = (err as { status?: number }).status;
            status.textContent = msg;
            status.style.color = status_ === 429 ? "var(--muted)" : "var(--red)";
        }
    });

    document.getElementById("settings-password-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const current = ($("st-pw-current") as HTMLInputElement).value;
        const next    = ($("st-pw-new") as HTMLInputElement).value;
        const confirmPw = ($("st-pw-confirm") as HTMLInputElement).value;
        if (next !== confirmPw) { alert("New passwords do not match."); return; }
        if (next.length < 8)  { alert("Password must be at least 8 characters."); return; }
        try {
            const res = await authFetch<{ token?: string }>("/api/settings/password", { method: "PUT", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
            if (res.token) {
                setToken(res.token);
            }
            ($("st-pw-current") as HTMLInputElement).value = "";
            ($("st-pw-new") as HTMLInputElement).value = "";
            ($("st-pw-confirm") as HTMLInputElement).value = "";
            const saved = $("st-pw-saved");
            saved.textContent = "Password changed";
            setTimeout(() => { saved.textContent = ""; }, 2500);
        } catch (err) { alert(`Failed: ${err}`); }
    });
}

export function activate(): void {
    void loadSettings();
}
