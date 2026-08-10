const ROW_UNIT = 4;

let frame = 0;
let observer: ResizeObserver | null = null;
const observed = new WeakSet<Element>();

function reset(grid: HTMLElement, cards: HTMLElement[]): void {
    grid.style.gridAutoRows = "";
    grid.style.alignItems = "";
    for (const card of cards) card.style.gridRowEnd = "";
}

function layoutGrid(grid: HTMLElement): void {
    const cards = Array.from(grid.children) as HTMLElement[];
    const style = getComputedStyle(grid);
    if (style.display !== "grid") {
        reset(grid, cards);
        return;
    }
    const columns = style.gridTemplateColumns.split(" ").filter(Boolean).length;
    if (columns <= 1) {
        reset(grid, cards);
        return;
    }
    const gap = parseFloat(style.rowGap) || 0;
    grid.style.gridAutoRows = "";
    grid.style.alignItems = "start";
    for (const card of cards) card.style.gridRowEnd = "";
    const spans = cards.map(card => {
        const height = card.getBoundingClientRect().height;
        return height > 0 ? Math.max(1, Math.ceil((height + gap) / (ROW_UNIT + gap))) : 0;
    });
    grid.style.gridAutoRows = `${ROW_UNIT}px`;
    cards.forEach((card, i) => {
        const span = spans[i]!;
        card.style.gridRowEnd = span > 0 ? `span ${span}` : "";
    });
}

export function layoutCardGrids(root: ParentNode = document): void {
    if (typeof document === "undefined") return;
    root.querySelectorAll<HTMLElement>(".card-grid, .card-grid-2").forEach(grid => {
        layoutGrid(grid);
        if (!observer) return;
        for (const card of Array.from(grid.children)) {
            if (observed.has(card)) continue;
            observed.add(card);
            observer.observe(card);
        }
    });
}

export function scheduleCardGridLayout(): void {
    if (typeof window === "undefined") return;
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
        frame = 0;
        layoutCardGrids();
    });
}

export function initCardGridLayout(): void {
    if (typeof window === "undefined" || observer) return;
    observer = new ResizeObserver(scheduleCardGridLayout);
    window.addEventListener("resize", scheduleCardGridLayout);
    if (document.fonts?.ready) void document.fonts.ready.then(scheduleCardGridLayout);
    scheduleCardGridLayout();
}
