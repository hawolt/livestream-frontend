import type { AccountSettings } from "../../api.ts";
import { copyText } from "../../clipboard.ts";
import { $ } from "../dom.ts";
import { authFetch, getMe, setToken } from "../session.ts";

let usernameCooldownRemaining = 0;
let activationGeneration = 0;
let settingsLoadRevision = 0;
let active = false;
const operationRevisions = new Map<string, number>();
const loadingControlStates = new Map<SettingsControl, boolean>();

type SettingsControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface SettingsOperation {
    key: string;
    generation: number;
    revision: number;
}

function isCurrentActivation(generation: number): boolean {
    return active && generation === activationGeneration;
}

function beginOperation(key: string): SettingsOperation {
    const revision = (operationRevisions.get(key) ?? 0) + 1;
    operationRevisions.set(key, revision);
    return { key, generation: activationGeneration, revision };
}

function isCurrentOperation(operation: SettingsOperation): boolean {
    return isCurrentActivation(operation.generation)
        && operationRevisions.get(operation.key) === operation.revision;
}

function setSettingsLoading(loading: boolean): void {
    const pane = $("pane-settings");
    pane.setAttribute("aria-busy", String(loading));
    if (loading) {
        if (loadingControlStates.size === 0) {
            pane.querySelectorAll<SettingsControl>("button, input, select, textarea").forEach(control => {
                loadingControlStates.set(control, control.disabled);
            });
        }
        loadingControlStates.forEach((_disabled, control) => {
            if (control.isConnected) control.disabled = true;
        });
        return;
    }
    loadingControlStates.forEach((disabled, control) => {
        if (control.isConnected) control.disabled = disabled;
    });
    loadingControlStates.clear();
}

function markSettingsLoadFailed(error: unknown): void {
    $("pane-settings").setAttribute("aria-busy", "false");
    const saved = $("st-saved");
    saved.textContent = error instanceof Error ? error.message : String(error);
    saved.style.color = "var(--red)";
}

function invalidateSettingsLoads(): void {
    settingsLoadRevision += 1;
    refreshSettingsIfActive();
}

function refreshSettingsIfActive(): void {
    if (active) void loadSettings(activationGeneration);
}

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

async function loadSettings(generation = activationGeneration): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const revision = ++settingsLoadRevision;
    setSettingsLoading(true);
    try {
        const s = await authFetch<AccountSettings>("/api/settings");
        if (!isCurrentActivation(generation) || revision !== settingsLoadRevision) return;
        ($("st-email") as HTMLInputElement).value = s.email ?? "";
        const banner = document.getElementById("settings-verify-banner");
        if (banner) banner.style.display = s.emailVerified === false ? "" : "none";
        applyChatColor(s.chatColor);
        const usernameCurrent = document.getElementById("st-username-current") as HTMLInputElement | null;
        if (usernameCurrent) usernameCurrent.value = s.username ?? getMe()?.username ?? "";
        renderBotCard(typeof s.chatBotToken === "string" ? s.chatBotToken : null);
        const liveNotify = document.getElementById("st-live-notify") as HTMLInputElement | null;
        if (liveNotify) liveNotify.checked = s.liveNotify !== false;
        setSettingsLoading(false);
        applyChatColorAllowed(s.chatColorAllowed !== false);
        formatUsernameHint(s);
    } catch (error) {
        if (!isCurrentActivation(generation) || revision !== settingsLoadRevision) return;
        setSettingsLoading(false);
        markSettingsLoadFailed(error);
        window.setTimeout(() => {
            if (isCurrentActivation(generation) && revision === settingsLoadRevision) void loadSettings(generation);
        }, 5000);
    }
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
        void copyText(token).then(copied => {
            copyBtn.textContent = copied ? "Copied" : "Failed";
            setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
        });
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
    const operation = beginOperation("bot-token");
    btn.disabled = true;
    try {
        const res = await authFetch<{ chatBotToken: string }>("/api/settings/chat-bot-token/rotate", { method: "POST" });
        if (isCurrentOperation(operation)) renderBotCard(res.chatBotToken);
        invalidateSettingsLoads();
    } catch (e) {
        if (isCurrentOperation(operation)) alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
        if (isCurrentOperation(operation)) btn.disabled = false;
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

function applyChatColorAllowed(allowed: boolean): void {
    const locked = document.getElementById("st-color-locked");
    const input = document.getElementById("st-chat-color") as HTMLInputElement | null;
    const saveBtn = document.getElementById("btn-color-save") as HTMLButtonElement | null;
    if (locked) locked.style.display = allowed ? "none" : "";
    if (input) input.disabled = !allowed;
    if (saveBtn) saveBtn.disabled = !allowed;
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
        const operation = beginOperation("resend-verification");
        btn.disabled = true;
        result.textContent = "Sending…";
        result.style.color = "var(--muted)";
        try {
            await authFetch("/api/auth/resend-verification", { method: "POST", body: "{}" });
            if (!isCurrentOperation(operation)) return;
            result.textContent = "Verification email sent, check your inbox.";
            result.style.color = "var(--green)";
        } catch (e) {
            if (!isCurrentOperation(operation)) return;
            const msg = e instanceof Error ? e.message : String(e);
            result.textContent = msg;
            result.style.color = msg.toLowerCase().includes("wait") ? "var(--muted)" : "var(--red)";
        } finally {
            if (isCurrentOperation(operation)) btn.disabled = false;
        }
    });

    document.getElementById("settings-account-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (btn?.disabled) return;
        const operation = beginOperation("account");
        const email = ($("st-email") as HTMLInputElement).value.trim();
        const passwordInput = $("st-email-password") as HTMLInputElement;
        const currentPassword = passwordInput.value;
        const saved = $("st-saved");
        if (!currentPassword) {
            saved.textContent = "Enter your current password to change your email address.";
            saved.style.color = "var(--red)";
            return;
        }
        const body: Record<string, string> = { email, currentPassword };
        if (btn) btn.disabled = true;
        try {
            const res = await authFetch<{ ok: boolean; emailVerified?: boolean; message?: string }>(
                "/api/settings", { method: "PUT", body: JSON.stringify(body) });
            if (isCurrentOperation(operation) && btn) btn.disabled = false;
            invalidateSettingsLoads();
            if (!isCurrentOperation(operation)) return;
            passwordInput.value = "";
            saved.style.color = "var(--success)";

            if (res.emailVerified === false) {
                const banner = document.getElementById("settings-verify-banner");
                if (banner) banner.style.display = "";
                saved.textContent = res.message ?? "Saved, check your inbox to verify your new email.";
            } else {
                saved.textContent = "Saved";
            }
            window.setTimeout(() => {
                if (isCurrentOperation(operation)) saved.textContent = "";
            }, 4000);
        } catch (err) {
            if (!isCurrentOperation(operation)) return;
            if (btn) btn.disabled = false;
            saved.textContent = err instanceof Error ? err.message : String(err);
            saved.style.color = "var(--red)";
        }
    });

    document.getElementById("st-chat-color")?.addEventListener("input", syncColorPreview);
    document.getElementById("st-username-new")?.addEventListener("input", updateUsernameSaveState);

    document.getElementById("st-live-notify")?.addEventListener("change", async (e) => {
        const cb = e.target as HTMLInputElement;
        const saved = document.getElementById("st-live-notify-saved");
        const operation = beginOperation("live-notify");
        cb.disabled = true;
        try {
            await authFetch("/api/settings/live-notify", { method: "PUT", body: JSON.stringify({ enabled: cb.checked }) });
            const current = isCurrentOperation(operation);
            if (current) {
                cb.disabled = false;
                if (saved) { saved.textContent = "Saved"; saved.style.color = "var(--success)"; }
            }
            invalidateSettingsLoads();
            if (!current) return;
        } catch (err) {
            if (!isCurrentOperation(operation)) return;
            cb.checked = !cb.checked;
            const msg = err instanceof Error ? err.message : String(err);
            if (saved) { saved.textContent = msg; saved.style.color = "var(--red)"; }
        }
        if (!isCurrentOperation(operation)) return;
        if (saved) window.setTimeout(() => {
            if (isCurrentOperation(operation)) saved.textContent = "";
        }, 3000);
    });

    async function saveChatColor(color: string | null): Promise<void> {
        const saved = document.getElementById("st-color-saved");
        const operation = beginOperation("chat-color");
        try {
            await authFetch("/api/settings/chat-color", { method: "PUT", body: JSON.stringify({ color: color ?? "" }) });
            invalidateSettingsLoads();
            if (!isCurrentOperation(operation)) return;
            if (color === null) applyChatColor(null);
            if (saved) { saved.textContent = color ? "Saved" : "Reset to default"; saved.style.color = "var(--success)"; }
        } catch (err) {
            if (!isCurrentOperation(operation)) return;
            const msg = err instanceof Error ? err.message : String(err);
            if (saved) { saved.textContent = msg; saved.style.color = "var(--red)"; }
        }
        if (saved) window.setTimeout(() => {
            if (isCurrentOperation(operation)) saved.textContent = "";
        }, 3000);
    }

    document.getElementById("settings-color-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void saveChatColor((document.getElementById("st-chat-color") as HTMLInputElement).value);
    });
    document.getElementById("btn-color-reset")?.addEventListener("click", () => void saveChatColor(null));

    document.getElementById("settings-username-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("btn-username-save") as HTMLButtonElement | null;
        if (btn?.disabled) return;
        const operation = beginOperation("username");
        const username = ($("st-username-new") as HTMLInputElement).value.trim();
        const password = ($("st-username-password") as HTMLInputElement).value;
        const status   = $("st-username-saved");
        if (!username || !password) {
            status.textContent = "Enter a new username and your current password.";
            status.style.color = "var(--red)";
            return;
        }
        if (btn) btn.disabled = true;
        try {
            const res = await authFetch<{ token: string; username: string }>(
                "/api/settings/username", { method: "PUT", body: JSON.stringify({ username, password }) });
            setToken(res.token);
            const me = getMe();
            if (me) me.username = res.username;
            if (isCurrentOperation(operation)) {
                ($("st-username-current") as HTMLInputElement).value = res.username;
                ($("st-username-new") as HTMLInputElement).value = "";
                ($("st-username-password") as HTMLInputElement).value = "";
                updateUsernameSaveState();
            }
            invalidateSettingsLoads();
            if (!isCurrentOperation(operation)) return;
            status.textContent = "Saved";
            status.style.color = "var(--success)";
            window.setTimeout(() => {
                if (isCurrentOperation(operation)) status.textContent = "";
            }, 2500);
        } catch (err) {
            if (!isCurrentOperation(operation)) return;
            const msg    = err instanceof Error ? err.message : String(err);
            const status_ = (err as { status?: number }).status;
            status.textContent = msg;
            status.style.color = status_ === 429 ? "var(--muted)" : "var(--red)";
            updateUsernameSaveState();
        }
    });

    document.getElementById("settings-password-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (btn?.disabled) return;
        const operation = beginOperation("password");
        const current = ($("st-pw-current") as HTMLInputElement).value;
        const next    = ($("st-pw-new") as HTMLInputElement).value;
        const confirmPw = ($("st-pw-confirm") as HTMLInputElement).value;
        if (next !== confirmPw) { alert("New passwords do not match."); return; }
        if (next.length < 8)  { alert("Password must be at least 8 characters."); return; }
        if (btn) btn.disabled = true;
        try {
            const res = await authFetch<{ token?: string }>("/api/settings/password", { method: "PUT", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
            if (res.token) {
                setToken(res.token);
            }
            if (!isCurrentOperation(operation)) return;
            ($("st-pw-current") as HTMLInputElement).value = "";
            ($("st-pw-new") as HTMLInputElement).value = "";
            ($("st-pw-confirm") as HTMLInputElement).value = "";
            const saved = $("st-pw-saved");
            saved.textContent = "Password changed";
            window.setTimeout(() => {
                if (isCurrentOperation(operation)) saved.textContent = "";
            }, 2500);
        } catch (err) {
            if (isCurrentOperation(operation)) alert(`Failed: ${err}`);
        } finally {
            if (isCurrentOperation(operation) && btn) btn.disabled = false;
        }
    });
}

export function activate(): void {
    active = true;
    const generation = ++activationGeneration;
    const resend = document.getElementById("btn-resend-verify") as HTMLButtonElement | null;
    const liveNotify = document.getElementById("st-live-notify") as HTMLInputElement | null;
    if (resend) resend.disabled = false;
    if (liveNotify) liveNotify.disabled = false;
    document.querySelectorAll<HTMLButtonElement>("#st-bot-body button").forEach(button => { button.disabled = false; });
    void loadSettings(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
}
