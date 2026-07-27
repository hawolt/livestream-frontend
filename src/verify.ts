export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";

void initSiteNav(null);

document.documentElement.classList.toggle("live-host", location.hostname.startsWith("live."));

const msgEl    = document.getElementById("verify-msg")!;
const actionEl = document.getElementById("verify-action")!;

function dashboardUrl(kind?: string): string {
    const baseDomain = location.hostname.replace(/^(live|admin)\./, "");
    const port = location.port ? `:${location.port}` : "";
    if (kind === "user") {
        return location.hostname.startsWith("live.")
            ? "/dashboard" : `${location.protocol}//live.${baseDomain}${port}/dashboard`;
    }
    if (kind === "admin") {
        return location.hostname.startsWith("admin.")
            ? "/dashboard" : `${location.protocol}//admin.${baseDomain}${port}/dashboard`;
    }
    return "/dashboard";
}

(async () => {
    const token = new URLSearchParams(location.search).get("token");
    if (!token) {
        msgEl.textContent = "No verification token found in the URL.";
        msgEl.style.color = "var(--red)";
        return;
    }

    try {
        const res  = await fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`);
        const data = await res.json() as { ok?: boolean; error?: string; kind?: string };

        if (res.ok && data.ok) {
            const dashboard = dashboardUrl(data.kind);
            msgEl.textContent = "Your email has been verified. Continue to your dashboard.";
            msgEl.style.color = "var(--green)";
            actionEl.innerHTML = `<a href="${dashboard}" class="btn-go-login">Continue</a>`;
            actionEl.style.display = "";
            setTimeout(() => { location.href = dashboard; }, 2500);
        } else {
            msgEl.textContent = data.error ?? "Invalid or expired verification link.";
            msgEl.style.color = "var(--red)";
            actionEl.innerHTML = `<a href="/login" class="btn-go-login">Back to Sign In</a>`;
            actionEl.style.display = "";
        }
    } catch {
        msgEl.textContent = "Network error, please try again.";
        msgEl.style.color = "var(--red)";
    }
})();
