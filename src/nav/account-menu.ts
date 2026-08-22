import { signOut } from "../nav.ts";
import type { SessionInfo } from "../nav.ts";
import { wireDropdown } from "./dropdown.ts";
import { ACCENT_THEMES, readAccent, setAccent } from "../theme.ts";

let themeSectionId = 0;

export const GEAR_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

function controlItems(controls: HTMLButtonElement[]): HTMLElement[] {
    return controls.map(ctrl => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "site-account-item site-account-item-btn";
        const sync = () => { item.textContent = ctrl.title || ctrl.textContent || ""; };
        sync();
        new MutationObserver(sync).observe(ctrl, { attributes: true, attributeFilter: ["title"] });
        item.addEventListener("click", () => { ctrl.click(); });
        return item;
    });
}

function separator(): HTMLElement {
    const el = document.createElement("div");
    el.className = "site-burger-sep";
    return el;
}

export function buildThemeSection(): HTMLElement {
    const section = document.createElement("div");
    section.className = "site-burger-section";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "site-burger-group";
    themeSectionId += 1;
    header.id = `site-theme-group-${themeSectionId}`;
    const label = document.createElement("span");
    label.textContent = "Theme";
    const chevron = document.createElement("span");
    chevron.className = "site-burger-chevron";
    chevron.setAttribute("aria-hidden", "true");
    header.append(label, chevron);

    const list = document.createElement("div");
    list.className = "site-burger-group-list";
    list.id = `${header.id}-list`;
    list.setAttribute("role", "group");
    list.setAttribute("aria-labelledby", header.id);
    header.setAttribute("aria-controls", list.id);
    header.setAttribute("aria-expanded", "false");

    const items = ACCENT_THEMES.map(theme => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "site-account-item site-account-item-btn site-theme-item";
        const dot = document.createElement("span");
        dot.className = "site-theme-dot";
        dot.style.background = theme.swatch;
        dot.setAttribute("aria-hidden", "true");
        const name = document.createElement("span");
        name.textContent = theme.label;
        item.append(dot, name);
        item.addEventListener("click", () => {
            sync(setAccent(theme.id));
        });
        return { id: theme.id, el: item };
    });

    function sync(active: string): void {
        for (const item of items) {
            const on = item.id === active;
            item.el.classList.toggle("active", on);
            item.el.setAttribute("aria-pressed", String(on));
        }
    }

    for (const item of items) list.appendChild(item.el);
    sync(readAccent());

    header.addEventListener("click", () => {
        const open = section.classList.toggle("open");
        header.setAttribute("aria-expanded", String(open));
    });

    section.append(header, list);
    return section;
}

export function buildViewMenu(controls: HTMLButtonElement[]): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-account";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-account-btn";
    btn.setAttribute("aria-label", "View settings");
    btn.title = "View settings";
    btn.innerHTML = GEAR_ICON;

    const panel = document.createElement("div");
    panel.className = "site-account-panel";
    panel.hidden = true;
    const items = controlItems(controls);
    for (const item of items) panel.appendChild(item);
    if (items.length) panel.appendChild(separator());
    panel.appendChild(buildThemeSection());

    wrap.append(btn, panel);
    wireDropdown(wrap, btn, panel);
    return wrap;
}

export function buildSignedOut(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-auth-cluster";

    const login = document.createElement("a");
    login.className = "btn btn-sm btn-fill-hover";
    login.href = `/login?return=${encodeURIComponent(location.href)}`;
    login.textContent = "Login";

    const register = document.createElement("a");
    register.className = "btn btn-sm btn-fill-hover";
    register.href = `/register?return=${encodeURIComponent(location.href)}`;
    register.textContent = "Sign up";

    wrap.append(login, register);
    return wrap;
}

export function buildSignedIn(info: SessionInfo, controls: HTMLButtonElement[] = []): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "site-account";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "site-account-btn";
    btn.setAttribute("aria-label", "Account menu");
    btn.title = "Account";
    btn.innerHTML = GEAR_ICON;

    const panel = document.createElement("div");
    panel.className = "site-account-panel";
    panel.hidden = true;

    const nameRow = document.createElement("a");
    nameRow.className = "site-account-name";
    nameRow.href = `/${encodeURIComponent(info.username ?? "")}`;
    nameRow.textContent = info.username ?? "";

    const dashLink = document.createElement("a");
    dashLink.className = "site-account-item";
    dashLink.href = "/dashboard";
    dashLink.textContent = "Dashboard";

    const signOutBtn = document.createElement("button");
    signOutBtn.type = "button";
    signOutBtn.className = "site-account-item site-account-item-btn";
    signOutBtn.textContent = "Sign out";

    panel.append(nameRow, dashLink);
    if (controls.length) {
        panel.appendChild(separator());
        for (const item of controlItems(controls)) panel.appendChild(item);
    }
    panel.appendChild(separator());
    panel.appendChild(buildThemeSection());
    panel.appendChild(separator());
    panel.appendChild(signOutBtn);
    wrap.append(btn, panel);
    wireDropdown(wrap, btn, panel);
    signOutBtn.addEventListener("click", () => void signOut(info.token, signOutBtn));
    return wrap;
}
