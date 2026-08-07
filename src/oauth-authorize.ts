export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { buildDenyRedirect, consentRequest, displayedScope, parseAuthorizeParams, scopeList, SCOPE_DESCRIPTIONS, type OAuthAuthorizeParams } from "./oauth-authorize/params.ts";
import { ensureSession, redirectToLogin } from "./oauth-authorize/session.ts";

void initSiteNav(null);

interface AuthorizeResponse {
    app?: string;
    clientId?: string;
    redirectUri?: string;
    scope?: string;
    state?: string;
    username?: string;
    pendingId?: string;
    error?: string;
    error_description?: string;
}

const loadingEl = document.getElementById("oauth-loading") as HTMLElement;
const consentEl = document.getElementById("oauth-consent") as HTMLElement;
const terminalEl = document.getElementById("oauth-terminal") as HTMLElement;
const appLineEl = document.getElementById("oauth-app-line") as HTMLElement;
const scopesEl = document.getElementById("oauth-scopes") as HTMLElement;
const accountEl = document.getElementById("oauth-account") as HTMLElement;
const errorEl = document.getElementById("oauth-error") as HTMLElement;
const approveBtn = document.getElementById("btn-approve") as HTMLButtonElement;
const denyBtn = document.getElementById("btn-deny") as HTMLButtonElement;

function showTerminal(message: string): void {
    loadingEl.hidden = true;
    consentEl.hidden = true;
    terminalEl.hidden = false;
    terminalEl.textContent = message;
}

function showError(message: string): void {
    errorEl.textContent = message;
    errorEl.style.display = "block";
}

function authorizeQuery(params: OAuthAuthorizeParams): string {
    const query = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        response_type: params.responseType,
        scope: params.scope,
    });
    if (params.state) query.set("state", params.state);
    return query.toString();
}

async function boot(): Promise<void> {
    const params = parseAuthorizeParams(location.search);
    if (!params) {
        showTerminal("This authorization link is invalid or incomplete. Contact the app that sent you here.");
        return;
    }

    const token = await ensureSession();
    if (!token) {
        redirectToLogin();
        return;
    }

    let res: Response;
    try {
        res = await fetch(`${API_BASE}/oauth/authorize?${authorizeQuery(params)}`, {
            headers: { "Authorization": `Bearer ${token}` },
            credentials: "include",
        });
    } catch {
        showTerminal("Network error, please reload and try again.");
        return;
    }
    const data = await res.json().catch(() => null) as AuthorizeResponse | null;
    if (res.status === 401) {
        sessionStorage.removeItem("dash_token");
        sessionStorage.removeItem("dash_kind");
        redirectToLogin();
        return;
    }
    const consentPayload = consentRequest(data);
    const serverScope = displayedScope(data);
    if (!res.ok || !data?.app || !consentPayload || !serverScope) {
        showTerminal(data?.error_description ?? "This authorization request was rejected. Contact the app that sent you here.");
        return;
    }

    const grantedScopes = scopeList(serverScope);
    const appName = document.createElement("strong");
    appName.textContent = data.app;
    const appAction = grantedScopes.some((scope) => scope !== "identity")
        ? " wants to access your itzon account"
        : " wants to verify your itzon identity";
    appLineEl.replaceChildren(appName, document.createTextNode(appAction));
    scopesEl.replaceChildren(...grantedScopes.map((scope) => {
        const line = document.createElement("div");
        line.className = "oauth-scope";
        const name = document.createElement("strong");
        name.textContent = scope;
        line.append(name, document.createTextNode(`: ${SCOPE_DESCRIPTIONS[scope] ?? "Unknown permission."}`));
        return line;
    }));
    accountEl.textContent = data.username ? `Signed in as ${data.username}` : "";
    loadingEl.hidden = true;
    consentEl.hidden = false;

    approveBtn.addEventListener("click", async () => {
        approveBtn.disabled = true;
        denyBtn.disabled = true;
        errorEl.style.display = "none";
        try {
            const consentRes = await fetch(`${API_BASE}/oauth/consent`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify(consentPayload),
            });
            const consentData = await consentRes.json().catch(() => null) as { redirect?: string; error_description?: string } | null;
            if (!consentRes.ok || !consentData?.redirect) {
                showError(consentData?.error_description ?? "Approval failed, please try again.");
                approveBtn.disabled = false;
                denyBtn.disabled = false;
                return;
            }
            location.href = consentData.redirect;
        } catch {
            showError("Network error, please try again.");
            approveBtn.disabled = false;
            denyBtn.disabled = false;
        }
    });

    denyBtn.addEventListener("click", () => {
        approveBtn.disabled = true;
        denyBtn.disabled = true;
        location.href = buildDenyRedirect(params.redirectUri, params.state);
    });
}

void boot();
