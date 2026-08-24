const SHADE_STYLE = "position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:rgba(0,0,0,.92);font-family:'Inter',-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,sans-serif;text-align:center";
const BOX_STYLE = "display:flex;flex-direction:column;align-items:center;gap:10px;max-width:420px";
const HEADING_STYLE = "color:#fff;font-size:16px;font-weight:700;letter-spacing:.01em";
const DETAIL_STYLE = "color:rgba(255,255,255,.75);font-size:13px;line-height:1.45";
const CONFIRM_STYLE = "margin-top:4px;padding:9px 18px;background:#fff;color:#000;border:none;border-radius:4px;font:inherit;font-size:13px;font-weight:700;cursor:pointer";
const LEAVE_STYLE = "color:rgba(255,255,255,.6);font-size:12px;text-decoration:underline";

export function promptEmbedMatureGate(host: HTMLElement, channel: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const shade = document.createElement("div");
        shade.style.cssText = SHADE_STYLE;

        const box = document.createElement("div");
        box.style.cssText = BOX_STYLE;

        const heading = document.createElement("div");
        heading.style.cssText = HEADING_STYLE;
        heading.textContent = "Mature content";

        const detail = document.createElement("div");
        detail.style.cssText = DETAIL_STYLE;
        detail.textContent = `${channel} is intended for adult audiences. Confirm that you are 18 or older to watch.`;

        const confirm = document.createElement("button");
        confirm.type = "button";
        confirm.style.cssText = CONFIRM_STYLE;
        confirm.textContent = "I am 18 or older";

        const leave = document.createElement("a");
        leave.style.cssText = LEAVE_STYLE;
        leave.href = "/";
        leave.target = "_top";
        leave.rel = "noopener";
        leave.textContent = "Take me back";

        box.append(heading, detail, confirm, leave);
        shade.appendChild(box);
        host.appendChild(shade);
        confirm.focus();

        function settle(allowed: boolean): void {
            shade.remove();
            resolve(allowed);
        }

        confirm.addEventListener("click", () => settle(true));
        leave.addEventListener("click", () => settle(false));
    });
}
