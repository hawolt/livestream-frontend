import { initSiteNav } from "./nav.ts";
import { copyText } from "./clipboard.ts";

void initSiteNav(null);

for (const el of Array.from(document.querySelectorAll("[data-fill=host]"))) el.textContent = location.host;

for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>(".content-guide video"))) {
    const guide = video.closest<HTMLElement>(".content-guide");
    if (!guide) continue;
    const hide = () => guide.remove();
    video.addEventListener("error", hide, { once: true });
    fetch(video.getAttribute("src") ?? "", { method: "HEAD" }).then((res) => {
        if (!res.ok) hide();
    }, hide);
}

for (const block of Array.from(document.querySelectorAll<HTMLPreElement>(".content-body pre"))) {
    const wrap = document.createElement("div");
    wrap.className = "content-pre-wrap";
    block.replaceWith(wrap);
    wrap.appendChild(block);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "content-copy";
    button.textContent = "Copy";
    button.addEventListener("click", () => {
        void copyText(block.innerText).then((copied) => {
            button.textContent = copied ? "Copied" : "Failed";
            window.setTimeout(() => { button.textContent = "Copy"; }, 1500);
        });
    });
    wrap.appendChild(button);
}

const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>(".content-toc a"));
if (tocLinks.length) {
    const byId = new Map<string, HTMLAnchorElement>();
    for (const link of tocLinks) byId.set(link.getAttribute("href")?.slice(1) ?? "", link);
    const headings = Array.from(document.querySelectorAll<HTMLElement>(".content-body h2[id]"));

    const sync = (): void => {
        let current = headings[0];
        for (const heading of headings) {
            if (heading.getBoundingClientRect().top <= 96) current = heading;
        }
        for (const link of tocLinks) link.classList.remove("active");
        if (current) byId.get(current.id)?.classList.add("active");
    };

    let queued = false;
    window.addEventListener("scroll", () => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            sync();
        });
    }, { passive: true });
    sync();
}

export {};
