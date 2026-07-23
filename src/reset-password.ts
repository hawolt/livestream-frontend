export {};
import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";

void initSiteNav(null);

document.documentElement.classList.toggle("live-host", location.hostname.startsWith("live."));

const errorEl = document.getElementById("error")!;
const token   = new URLSearchParams(location.search).get("token") ?? "";

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
