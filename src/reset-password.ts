export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { scrubQueryToken } from "./url-secrets.ts";

const tokenState = scrubQueryToken(location.href);
const token = tokenState.token;
if (tokenState.replacement) history.replaceState(history.state, "", tokenState.replacement);

void initSiteNav(null);

const resetBaseDomain = location.hostname.replace(/^(live|admin|staff)\./, "");
const isResetLiveHost = location.hostname === resetBaseDomain || location.hostname.startsWith("live.");
document.documentElement.classList.toggle("live-host", isResetLiveHost);

const errorEl = document.getElementById("error")!;

if (!token) {
    errorEl.textContent = "No reset token found in the URL. Please use the link from your email.";
    errorEl.style.display = "block";
    (document.getElementById("btn-reset") as HTMLButtonElement).disabled = true;
}

document.getElementById("reset-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.style.display = "none";

    const newPassword     = (document.getElementById("new-password")     as HTMLInputElement).value;
    const confirmPassword = (document.getElementById("confirm-password") as HTMLInputElement).value;

    if (newPassword !== confirmPassword) {
        errorEl.textContent = "Passwords do not match.";
        errorEl.style.display = "block";
        return;
    }

    const btn = document.getElementById("btn-reset") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
        const res  = await fetch(`${API_BASE}/auth/reset-password`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token, newPassword }),
        });
        const data = await res.json() as { ok?: boolean; error?: string };

        if (res.ok && data.ok) {
            document.getElementById("section-form")!.style.display = "none";
            document.getElementById("section-done")!.style.display = "";
            setTimeout(() => { location.href = "/login"; }, 2500);
        } else {
            errorEl.textContent = data.error ?? "Reset failed. The link may have expired.";
            errorEl.style.display = "block";
            btn.disabled = false;
            btn.textContent = "Set New Password";
        }
    } catch {
        errorEl.textContent = "Network error, please try again.";
        errorEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Set New Password";
    }
});
