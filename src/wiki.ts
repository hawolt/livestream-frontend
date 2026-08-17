import { initSiteNav } from "./nav.ts";

void initSiteNav(null);

for (const el of Array.from(document.querySelectorAll("[data-fill=host]"))) el.textContent = location.host;

for (const video of Array.from(document.querySelectorAll<HTMLVideoElement>(".wiki-guide video"))) {
    const guide = video.closest<HTMLElement>(".wiki-guide");
    if (!guide) continue;
    const hide = () => guide.remove();
    video.addEventListener("error", hide, { once: true });
    fetch(video.getAttribute("src") ?? "", { method: "HEAD" }).then((res) => {
        if (!res.ok) hide();
    }, hide);
}

const sections = Array.from(document.querySelectorAll<HTMLElement>("#wiki-content section[data-topic]"));
const topicsNav = document.getElementById("wiki-topics");

function activate(topic: string): void {
    let found = sections.find((s) => s.dataset["topic"] === topic) ?? sections[0];
    if (!found) return;
    for (const s of sections) s.classList.toggle("active", s === found);
    for (const a of Array.from(topicsNav?.querySelectorAll("a") ?? [])) {
        a.classList.toggle("active", a.dataset["topic"] === found.dataset["topic"]);
    }
    document.title = `${found.dataset["title"] ?? "API"} | API documentation | ITZON`;
}

if (topicsNav) {
    for (const s of sections) {
        const a = document.createElement("a");
        a.href = `#${s.dataset["topic"]}`;
        a.dataset["topic"] = s.dataset["topic"] ?? "";
        a.textContent = s.dataset["title"] ?? s.dataset["topic"] ?? "";
        topicsNav.append(a);
    }
}

window.addEventListener("hashchange", () => activate(location.hash.slice(1)));
activate(location.hash.slice(1));
