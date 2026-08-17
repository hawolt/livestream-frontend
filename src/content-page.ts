import { initSiteNav } from "./nav.ts";

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

export {};
