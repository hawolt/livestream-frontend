const SVG_NS = "http://www.w3.org/2000/svg";

function svg(viewBox: string, children: SVGElement[]): SVGSVGElement {
    const el = document.createElementNS(SVG_NS, "svg");
    el.setAttribute("viewBox", viewBox);
    for (const child of children) el.appendChild(child);
    return el;
}

function fillPath(d: string): SVGPathElement {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    return path;
}

function strokePath(d: string): SVGPathElement {
    const path = fillPath(d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    return path;
}

export function iconPlay(): SVGSVGElement {
    return svg("0 0 24 24", [fillPath("M8 5v14l11-7z")]);
}

export function iconPause(): SVGSVGElement {
    return svg("0 0 24 24", [fillPath("M6 5h4v14H6zM14 5h4v14h-4z")]);
}

export function iconVolume(): SVGSVGElement {
    return svg("0 0 24 24", [fillPath("M3 10v4h4l5 5V5L7 10H3z"), strokePath("M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12")]);
}

export function iconVolumeLow(): SVGSVGElement {
    return svg("0 0 24 24", [fillPath("M3 10v4h4l5 5V5L7 10H3z"), strokePath("M15.5 8.5a5 5 0 010 7")]);
}

export function iconMute(): SVGSVGElement {
    const cross = strokePath("M16.2 10.2l3.6 3.6m0-3.6l-3.6 3.6");
    cross.setAttribute("stroke-width", "2");
    return svg("0 0 24 24", [fillPath("M3 10v4h4l5 5V5L7 10H3z"), cross]);
}
