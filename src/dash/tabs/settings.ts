import type { AccountSettings, ApiTokenCreated, ApiTokenInfo, OAuthGrantInfo } from "../../api.ts";
import { copyText } from "../../clipboard.ts";
import { authFetch, getMe, setToken } from "../session.ts";

let usernameCooldownRemaining = 0;
let activationGeneration = 0;
let settingsLoadRevision = 0;
let active = false;
let settingsPane: HTMLElement | null = null;
let integrationPane: HTMLElement | null = null;
const wiredPanes = new WeakSet<HTMLElement>();
const dirtyFields = new WeakSet<HTMLElement>();
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

function managedPanes(): HTMLElement[] {
    return [settingsPane, integrationPane].filter((p): p is HTMLElement => p !== null);
}

function loadErrorElements(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const fromSettings = settingsPane?.querySelector<HTMLElement>("#st-load-error");
    if (fromSettings) out.push(fromSettings);
    const fromIntegration = integrationPane?.querySelector<HTMLElement>("#it-load-error");
    if (fromIntegration) out.push(fromIntegration);
    return out;
}

function shouldSkipRefresh(el: HTMLElement | null): boolean {
    return !!el && (document.activeElement === el || dirtyFields.has(el));
}

function markDirty(el: HTMLElement | null): void {
    if (el) dirtyFields.add(el);
}

function clearDirty(el: HTMLElement | null): void {
    if (el) dirtyFields.delete(el);
}

function trackDirtyOnInput(el: HTMLElement | null): void {
    el?.addEventListener("input", () => markDirty(el));
}

function setSettingsLoading(loading: boolean): void {
    const panes = managedPanes();
    for (const pane of panes) pane.setAttribute("aria-busy", String(loading));
    if (loading) {
        if (loadingControlStates.size === 0) {
            for (const pane of panes) {
                pane.querySelectorAll<SettingsControl>("button, input, select, textarea").forEach(control => {
                    if (shouldSkipRefresh(control)) return;
                    loadingControlStates.set(control, control.disabled);
                });
            }
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
    for (const pane of managedPanes()) pane.setAttribute("aria-busy", "false");
    const message = error instanceof Error ? error.message : String(error);
    for (const el of loadErrorElements()) {
        el.textContent = message;
        el.style.display = "";
    }
}

function clearSettingsLoadFailed(): void {
    for (const el of loadErrorElements()) {
        el.textContent = "";
        el.style.display = "none";
    }
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
        clearSettingsLoadFailed();
        const emailInput = document.getElementById("st-email") as HTMLInputElement | null;
        if (emailInput && !shouldSkipRefresh(emailInput)) emailInput.value = s.email ?? "";
        const banner = document.getElementById("settings-verify-banner");
        if (banner) banner.style.display = s.emailVerified === false ? "" : "none";
        const colorInput = document.getElementById("st-chat-color") as HTMLInputElement | null;
        if (!shouldSkipRefresh(colorInput)) applyChatColor(s.chatColor);
        const usernameCurrent = document.getElementById("st-username-current") as HTMLInputElement | null;
        if (usernameCurrent) usernameCurrent.value = s.username ?? getMe()?.username ?? "";
        renderBotCard(typeof s.chatBotToken === "string" ? s.chatBotToken : null);
        const liveNotify = document.getElementById("st-live-notify") as HTMLInputElement | null;
        if (liveNotify && !shouldSkipRefresh(liveNotify)) liveNotify.checked = s.liveNotify !== false;
        const patronPublic = document.getElementById("st-patron-public") as HTMLInputElement | null;
        if (patronPublic && !shouldSkipRefresh(patronPublic)) patronPublic.checked = s.patronPublic !== false;
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

function formatTokenDate(millis: number | null): string {
    return typeof millis === "number" ? new Date(millis).toLocaleDateString() : "never";
}

function formatTokenScope(scope: string): string {
    const parts = scope.split(/\s+/).filter(Boolean);
    const names: string[] = [];
    if (parts.includes("api:read")) names.push("read");
    if (parts.includes("api:write")) names.push("write");
    return names.join(" + ") || "identity";
}

function selectedTokenScopes(): string[] {
    const scopes: string[] = [];
    if ((document.getElementById("st-api-scope-read") as HTMLInputElement | null)?.checked) scopes.push("api:read");
    if ((document.getElementById("st-api-scope-write") as HTMLInputElement | null)?.checked) scopes.push("api:write");
    return scopes;
}

function updateTokenScopeState(): void {
    const btn = document.getElementById("btn-api-token-create") as HTMLButtonElement | null;
    const status = document.getElementById("st-api-token-status");
    const none = selectedTokenScopes().length === 0;
    if (btn) btn.disabled = none;
    if (status) {
        if (none) {
            status.textContent = "Pick at least one scope.";
            status.style.color = "var(--red)";
        } else if (status.textContent === "Pick at least one scope.") {
            status.textContent = "";
        }
    }
}

function renderApiTokens(tokens: ApiTokenInfo[]): void {
    const el = document.getElementById("st-api-tokens-body");
    if (!el) return;
    el.replaceChildren();
    if (tokens.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:13px;color:var(--muted)";
        empty.textContent = "No API tokens yet.";
        el.append(empty);
        return;
    }
    for (const token of tokens) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--border)";
        const code = document.createElement("code");
        code.style.cssText = "font-size:11px";
        code.textContent = `${token.prefix}…`;
        const label = document.createElement("span");
        label.style.cssText = "font-size:13px;flex:1;min-width:120px";
        label.textContent = token.label || "(no label)";
        const scope = document.createElement("span");
        scope.style.cssText = "font-size:11px;color:var(--muted);border:1px solid var(--border);border-radius:4px;padding:1px 6px";
        scope.textContent = formatTokenScope(token.scope);
        const dates = document.createElement("span");
        dates.style.cssText = "font-size:12px;color:var(--muted)";
        dates.textContent = `created ${formatTokenDate(token.createdAt)}, last used ${formatTokenDate(token.lastUsedAt)}`;
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn btn-sm btn-danger";
        deleteBtn.textContent = "Delete";
        deleteBtn.addEventListener("click", () => void deleteApiToken(token, deleteBtn));
        row.append(code, label, scope, dates, deleteBtn);
        el.append(row);
    }
}

async function loadApiTokens(generation = activationGeneration): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const operation = beginOperation("api-tokens-load");
    try {
        const res = await authFetch<{ tokens: ApiTokenInfo[] }>("/api/settings/api-tokens");
        if (isCurrentOperation(operation)) renderApiTokens(res.tokens);
    } catch (e) {
        if (!isCurrentOperation(operation)) return;
        const el = document.getElementById("st-api-tokens-body");
        if (el) {
            el.replaceChildren();
            const err = document.createElement("div");
            err.style.cssText = "font-size:13px;color:var(--red)";
            err.textContent = e instanceof Error ? e.message : String(e);
            el.append(err);
        }
    }
}

function clearCreatedApiToken(): void {
    const el = document.getElementById("st-api-token-created");
    if (!el) return;
    el.replaceChildren();
    el.style.cssText = "display:none";
}

function renderCreatedApiToken(created: ApiTokenCreated): void {
    const el = document.getElementById("st-api-token-created");
    if (!el) return;
    el.replaceChildren();
    el.style.cssText = "display:block;border:1px solid #854d0e;border-radius:6px;padding:10px;margin:0 0 12px";
    const warning = document.createElement("div");
    warning.style.cssText = "font-size:13px;color:#fbbf24;margin-bottom:8px";
    warning.textContent = "Copy this token now, it will not be shown again.";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
    const code = document.createElement("code");
    code.style.cssText = "font-size:11px;word-break:break-all";
    code.textContent = created.token;
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-sm";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
        void copyText(created.token).then(copied => {
            copyBtn.textContent = copied ? "Copied" : "Failed";
            setTimeout(() => { copyBtn.textContent = "Copy"; }, 1200);
        });
    });
    const dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn-sm";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.addEventListener("click", clearCreatedApiToken);
    row.append(code, copyBtn, dismissBtn);
    el.append(warning, row);
}

async function createApiToken(): Promise<void> {
    const btn = document.getElementById("btn-api-token-create") as HTMLButtonElement | null;
    const labelInput = document.getElementById("st-api-token-label") as HTMLInputElement | null;
    const status = document.getElementById("st-api-token-status");
    const scopes = selectedTokenScopes();
    if (scopes.length === 0) {
        updateTokenScopeState();
        return;
    }
    const operation = beginOperation("api-token-create");
    if (btn) btn.disabled = true;
    try {
        const created = await authFetch<ApiTokenCreated>("/api/settings/api-tokens", {
            method: "POST",
            body: JSON.stringify({ label: labelInput?.value.trim() ?? "", scopes }),
        });
        if (isCurrentOperation(operation)) {
            if (labelInput) labelInput.value = "";
            if (status) status.textContent = "";
            renderCreatedApiToken(created);
        }
        void loadApiTokens(operation.generation);
    } catch (e) {
        if (isCurrentOperation(operation) && status) {
            status.textContent = e instanceof Error ? e.message : String(e);
            status.style.color = "var(--red)";
        }
    } finally {
        if (isCurrentOperation(operation) && btn) btn.disabled = false;
    }
}

async function deleteApiToken(token: ApiTokenInfo, btn: HTMLButtonElement): Promise<void> {
    const name = token.label ? `"${token.label}"` : `${token.prefix}…`;
    if (!confirm(`Delete API token ${name}? Requests using it stop working immediately.`)) return;
    const operation = beginOperation("api-token-delete");
    btn.disabled = true;
    try {
        await authFetch(`/api/settings/api-tokens/${token.id}`, { method: "DELETE" });
        void loadApiTokens(operation.generation);
    } catch (e) {
        if (isCurrentOperation(operation)) {
            alert("Failed: " + (e instanceof Error ? e.message : String(e)));
            btn.disabled = false;
        }
    }
}

function formatGrantScope(scope: string): string {
    const parts = scope.split(/\s+/).filter(Boolean);
    const names: string[] = ["identity"];
    if (parts.includes("api:read")) names.push("read");
    if (parts.includes("api:write")) names.push("write");
    return names.join(" + ");
}

function renderOAuthGrants(grants: OAuthGrantInfo[]): void {
    const el = document.getElementById("st-oauth-grants-body");
    if (!el) return;
    el.replaceChildren();
    if (grants.length === 0) {
        const empty = document.createElement("div");
        empty.style.cssText = "font-size:13px;color:var(--muted)";
        empty.textContent = "No connected apps.";
        el.append(empty);
        return;
    }
    for (const grant of grants) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--border)";
        const name = document.createElement("span");
        name.style.cssText = "font-size:13px;font-weight:600;flex:1;min-width:120px";
        name.textContent = grant.app;
        const scope = document.createElement("span");
        scope.style.cssText = "font-size:11px;color:var(--muted);border:1px solid var(--border);border-radius:4px;padding:1px 6px";
        scope.textContent = formatGrantScope(grant.scope);
        const dates = document.createElement("span");
        dates.style.cssText = "font-size:12px;color:var(--muted)";
        dates.textContent = `granted ${formatTokenDate(grant.grantedAt)}, last used ${formatTokenDate(grant.lastUsedAt)}`;
        const revokeBtn = document.createElement("button");
        revokeBtn.className = "btn btn-sm btn-danger";
        revokeBtn.textContent = "Revoke";
        revokeBtn.addEventListener("click", () => void revokeOAuthGrant(grant, revokeBtn));
        row.append(name, scope, dates, revokeBtn);
        el.append(row);
    }
}

async function loadOAuthGrants(generation = activationGeneration): Promise<void> {
    if (!isCurrentActivation(generation)) return;
    const operation = beginOperation("oauth-grants-load");
    try {
        const res = await authFetch<{ grants: OAuthGrantInfo[] }>("/api/settings/oauth-grants");
        if (isCurrentOperation(operation)) renderOAuthGrants(res.grants);
    } catch (e) {
        if (!isCurrentOperation(operation)) return;
        const el = document.getElementById("st-oauth-grants-body");
        if (el) {
            el.replaceChildren();
            const err = document.createElement("div");
            err.style.cssText = "font-size:13px;color:var(--red)";
            err.textContent = e instanceof Error ? e.message : String(e);
            el.append(err);
        }
    }
}

async function revokeOAuthGrant(grant: OAuthGrantInfo, btn: HTMLButtonElement): Promise<void> {
    if (!confirm(`Revoke access for "${grant.app}"? Its tokens stop working immediately and it has to ask for your approval again.`)) return;
    const operation = beginOperation("oauth-grant-revoke");
    btn.disabled = true;
    try {
        await authFetch(`/api/settings/oauth-grants/${encodeURIComponent(grant.clientId)}`, { method: "DELETE" });
        void loadOAuthGrants(operation.generation);
    } catch (e) {
        if (isCurrentOperation(operation)) {
            alert("Failed: " + (e instanceof Error ? e.message : String(e)));
            btn.disabled = false;
        }
    }
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

async function loadReferrals(): Promise<void> {
    const host = document.getElementById("st-referrals");
    if (!host) return;
    try {
        const res = await authFetch<{ referrals: Array<{ username: string; verified: boolean; createdAt: number }> }>(
            "/api/settings/referrals");
        host.replaceChildren();
        if (!res.referrals.length) {
            const empty = document.createElement("span");
            empty.style.color = "var(--muted)";
            empty.textContent = "No one has signed up with your link yet.";
            host.appendChild(empty);
            return;
        }
        for (const referral of res.referrals) {
            const row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;gap:10px";
            const name = document.createElement("span");
            name.textContent = referral.username;
            const status = document.createElement("span");
            status.style.cssText = "font-size:11.5px;border-radius:999px;padding:1px 9px;border:1px solid";
            if (referral.verified) {
                status.textContent = "Verified";
                status.style.color = "var(--success)";
                status.style.borderColor = "var(--success)";
            } else {
                status.textContent = "Pending";
                status.style.color = "var(--muted)";
                status.style.borderColor = "var(--border)";
            }
            const when = document.createElement("span");
            when.style.cssText = "color:var(--muted);font-size:12px;margin-left:auto";
            when.textContent = new Date(referral.createdAt).toLocaleDateString();
            row.append(name, status, when);
            host.appendChild(row);
        }
    } catch {
        host.replaceChildren();
        const err = document.createElement("span");
        err.style.color = "var(--muted)";
        err.textContent = "Could not load invited people.";
        host.appendChild(err);
    }
}

export function init(pane: HTMLElement): void {
    if (wiredPanes.has(pane)) return;
    wiredPanes.add(pane);
    if (pane.id === "pane-settings") settingsPane = pane;
    else if (pane.id === "pane-integration") integrationPane = pane;

    const me = getMe();
    const flags = new Set((me?.flags ?? "").split(",").map(f => f.trim()).filter(Boolean));
    const inviteLinkEl = pane.querySelector<HTMLInputElement>("#st-invite-link");
    if (inviteLinkEl && me?.username) {
        inviteLinkEl.value = `${location.origin}/register?ref=${encodeURIComponent(me.username)}`;
    }
    if (pane.querySelector("#st-referrals")) void loadReferrals();
    pane.querySelector("#btn-invite-copy")?.addEventListener("click", () => {
        const copied = pane.querySelector<HTMLElement>("#st-invite-copied");
        void copyText(inviteLinkEl?.value ?? "").then(ok => {
            if (!copied) return;
            copied.style.visibility = ok ? "visible" : "hidden";
            window.setTimeout(() => { copied.style.visibility = "hidden"; }, 2000);
        });
    });
    const pendingBanner = pane.querySelector<HTMLElement>("#settings-pending-banner");
    if (pendingBanner) {
        pendingBanner.style.display = (me?.kind === "user" && flags.size === 0) ? "" : "none";
    }

    pane.querySelector("#btn-resend-verify")?.addEventListener("click", async () => {
        const btn    = pane.querySelector("#btn-resend-verify") as HTMLButtonElement;
        const result = pane.querySelector<HTMLElement>("#resend-result")!;
        const operation = beginOperation("resend-verification");
        btn.disabled = true;
        result.textContent = "Sending…";
        result.style.color = "var(--muted)";
        try {
            await authFetch("/api/auth/resend-verification", { method: "POST", body: "{}" });
            if (!isCurrentOperation(operation)) return;
            result.textContent = "Verification email sent, check your inbox.";
            result.style.color = "var(--success)";
        } catch (e) {
            if (!isCurrentOperation(operation)) return;
            const msg = e instanceof Error ? e.message : String(e);
            result.textContent = msg;
            result.style.color = msg.toLowerCase().includes("wait") ? "var(--muted)" : "var(--red)";
        } finally {
            if (isCurrentOperation(operation)) btn.disabled = false;
        }
    });

    const emailInput = pane.querySelector<HTMLInputElement>("#st-email");
    trackDirtyOnInput(emailInput);
    pane.querySelector("#settings-account-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (btn?.disabled) return;
        const operation = beginOperation("account");
        const email = (pane.querySelector("#st-email") as HTMLInputElement).value.trim();
        const passwordInput = pane.querySelector("#st-email-password") as HTMLInputElement;
        const currentPassword = passwordInput.value;
        const saved = pane.querySelector("#st-saved") as HTMLElement;
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
            clearDirty(emailInput);
            invalidateSettingsLoads();
            if (!isCurrentOperation(operation)) return;
            passwordInput.value = "";
            saved.style.color = "var(--success)";

            if (res.emailVerified === false) {
                const banner = pane.querySelector<HTMLElement>("#settings-verify-banner");
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

    pane.querySelector("#settings-api-token-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void createApiToken();
    });
    pane.querySelector("#st-api-scope-read")?.addEventListener("change", updateTokenScopeState);
    pane.querySelector("#st-api-scope-write")?.addEventListener("change", updateTokenScopeState);

    const colorInput = pane.querySelector<HTMLInputElement>("#st-chat-color");
    colorInput?.addEventListener("input", syncColorPreview);
    trackDirtyOnInput(colorInput);
    pane.querySelector("#st-username-new")?.addEventListener("input", updateUsernameSaveState);

    pane.querySelector("#st-patron-public")?.addEventListener("change", async (e) => {
        const cb = e.target as HTMLInputElement;
        const saved = pane.querySelector<HTMLElement>("#st-patron-public-saved");
        const operation = beginOperation("patron-public");
        cb.disabled = true;
        try {
            await authFetch("/api/settings/patron-visibility", { method: "PUT", body: JSON.stringify({ enabled: cb.checked }) });
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
            if (saved) { saved.textContent = msg; saved.style.color = "var(--danger)"; }
            cb.disabled = false;
        }
        window.setTimeout(() => { if (saved && isCurrentOperation(operation)) saved.textContent = ""; }, 2500);
    });

    pane.querySelector("#st-live-notify")?.addEventListener("change", async (e) => {
        const cb = e.target as HTMLInputElement;
        const saved = pane.querySelector<HTMLElement>("#st-live-notify-saved");
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
        const saved = pane.querySelector<HTMLElement>("#st-color-saved");
        const operation = beginOperation("chat-color");
        try {
            await authFetch("/api/settings/chat-color", { method: "PUT", body: JSON.stringify({ color: color ?? "" }) });
            clearDirty(colorInput);
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

    pane.querySelector("#settings-color-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        void saveChatColor((pane.querySelector("#st-chat-color") as HTMLInputElement).value);
    });
    pane.querySelector("#btn-color-reset")?.addEventListener("click", () => void saveChatColor(null));

    pane.querySelector("#settings-username-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = pane.querySelector("#btn-username-save") as HTMLButtonElement | null;
        if (btn?.disabled) return;
        const operation = beginOperation("username");
        const username = (pane.querySelector("#st-username-new") as HTMLInputElement).value.trim();
        const password = (pane.querySelector("#st-username-password") as HTMLInputElement).value;
        const status   = pane.querySelector("#st-username-saved") as HTMLElement;
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
                (pane.querySelector("#st-username-current") as HTMLInputElement).value = res.username;
                (pane.querySelector("#st-username-new") as HTMLInputElement).value = "";
                (pane.querySelector("#st-username-password") as HTMLInputElement).value = "";
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

    pane.querySelector("#settings-password-form")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (btn?.disabled) return;
        const operation = beginOperation("password");
        const current = (pane.querySelector("#st-pw-current") as HTMLInputElement).value;
        const next    = (pane.querySelector("#st-pw-new") as HTMLInputElement).value;
        const confirmPw = (pane.querySelector("#st-pw-confirm") as HTMLInputElement).value;
        if (next !== confirmPw) { alert("New passwords do not match."); return; }
        if (next.length < 8)  { alert("Password must be at least 8 characters."); return; }
        if (btn) btn.disabled = true;
        try {
            const res = await authFetch<{ token?: string }>("/api/settings/password", { method: "PUT", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
            if (res.token) {
                setToken(res.token);
            }
            void loadApiTokens(operation.generation);
            void loadOAuthGrants(operation.generation);
            if (!isCurrentOperation(operation)) return;
            (pane.querySelector("#st-pw-current") as HTMLInputElement).value = "";
            (pane.querySelector("#st-pw-new") as HTMLInputElement).value = "";
            (pane.querySelector("#st-pw-confirm") as HTMLInputElement).value = "";
            const saved = pane.querySelector("#st-pw-saved") as HTMLElement;
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
    const patronPublic = document.getElementById("st-patron-public") as HTMLInputElement | null;
    if (resend) resend.disabled = false;
    if (liveNotify) liveNotify.disabled = false;
    if (patronPublic) patronPublic.disabled = false;
    document.querySelectorAll<HTMLButtonElement>("#st-bot-body button").forEach(button => { button.disabled = false; });
    const createTokenBtn = document.getElementById("btn-api-token-create") as HTMLButtonElement | null;
    if (createTokenBtn) createTokenBtn.disabled = false;
    updateTokenScopeState();
    void loadSettings(generation);
    void loadApiTokens(generation);
    void loadOAuthGrants(generation);
}

export function deactivate(): void {
    active = false;
    activationGeneration += 1;
    clearCreatedApiToken();
}
