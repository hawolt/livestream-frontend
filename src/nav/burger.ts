import { signOut } from "../nav.ts";
import type { SessionInfo } from "../nav.ts";
import { wireDropdown } from "./dropdown.ts";

const MENU_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>`;

let burgerExtraProvider: ((close: () => void) => HTMLElement[]) | null = null;
export function setBurgerExtra(provider: ((close: () => void) => HTMLElement[]) | null): void {
    burgerExtraProvider = provider;
}

export function buildBurger(info: SessionInfo | null, pageControls: HTMLElement[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-burger";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-burger-btn";
    btn.setAttribute("aria-label", "Menu");
    btn.title = "Menu";
    btn.innerHTML = MENU_ICON;

    const panel = document.createElement("div");
    panel.className = "site-burger-panel";
    panel.hidden = true;

    function sep(): HTMLElement {
        const el = document.createElement("div");
        el.className = "site-burger-sep";
        return el;
    }

    function link(label: string, href: string): HTMLAnchorElement {
        const a = document.createElement("a");
        a.className = "site-account-item";
        a.href = href;
        a.textContent = label;
        return a;
    }

    let burgerClose: () => void = () => { panel.hidden = true; };

    function rebuild(): void {
        panel.replaceChildren();

        if (burgerExtraProvider) {
            const extra = burgerExtraProvider(burgerClose);
            for (const el of extra) panel.appendChild(el);
            if (extra.length) panel.appendChild(sep());
        }

        let hasControls = false;
        for (const ctrl of pageControls) {
            if (!(ctrl instanceof HTMLButtonElement)) continue;
            if (getComputedStyle(ctrl).display === "none") continue;
            const item = document.createElement("button");
            item.type = "button";
            item.className = "site-account-item";
            item.textContent = ctrl.title || ctrl.textContent || "";
            item.addEventListener("click", () => {
                ctrl.click();
                rebuild();
            });
            panel.appendChild(item);
            hasControls = true;
        }
        if (hasControls) panel.appendChild(sep());

        if (info) {
            const nameRow = document.createElement("a");
            nameRow.className = "site-account-name";
            nameRow.href = `/${encodeURIComponent(info.username ?? "")}`;
            nameRow.textContent = info.username ?? "";
            panel.appendChild(nameRow);
            panel.appendChild(link("Dashboard", "/dashboard"));
            const out = document.createElement("button");
            out.type = "button";
            out.className = "site-account-item";
            out.textContent = "Sign out";
            out.addEventListener("click", () => void signOut(info.token, out));
            panel.appendChild(out);
        } else {
            panel.appendChild(link("Login", `/login?return=${encodeURIComponent(location.href)}`));
            panel.appendChild(link("Sign up", `/register?return=${encodeURIComponent(location.href)}`));
        }
    }

    wrap.append(btn, panel);
    burgerClose = wireDropdown(wrap, btn, panel, rebuild);
    return wrap;
}
