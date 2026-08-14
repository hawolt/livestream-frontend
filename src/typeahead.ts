export interface TypeaheadOption {
    value: string;
    label: string;
}

export interface TypeaheadHandle {
    setValue(value: string): void;
    value(): string;
}

const LIST_LIMIT = 50;

export function filterTypeaheadOptions(
    options: readonly TypeaheadOption[],
    query: string,
    limit: number = LIST_LIMIT,
): TypeaheadOption[] {
    const q = query.trim().toLowerCase();
    const matches = q === "" ? [...options] : options.filter((o) => o.label.toLowerCase().includes(q));
    return matches.slice(0, limit);
}

export function exactTypeaheadMatch(
    options: readonly TypeaheadOption[],
    text: string,
): TypeaheadOption | null {
    const q = text.trim().toLowerCase();
    return options.find((o) => o.label.toLowerCase() === q) ?? null;
}

export function attachTypeahead(
    input: HTMLInputElement,
    options: readonly TypeaheadOption[],
    onSelect?: (value: string) => void,
): TypeaheadHandle {
    let selected = "";
    let items: TypeaheadOption[] = [];
    let active = -1;

    const wrap = document.createElement("div");
    wrap.className = "typeahead-wrap";
    input.parentElement?.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");

    const list = document.createElement("div");
    list.className = "typeahead-list";
    list.hidden = true;
    wrap.appendChild(list);

    const labelFor = (value: string): string => options.find((o) => o.value === value)?.label ?? "";

    function close(): void {
        list.hidden = true;
        active = -1;
    }

    function commit(option: TypeaheadOption): void {
        const changed = option.value !== selected;
        selected = option.value;
        input.value = option.label;
        close();
        if (changed) onSelect?.(option.value);
    }

    function renderList(): void {
        items = filterTypeaheadOptions(options, input.value);
        list.replaceChildren(...items.map((o, i) => {
            const row = document.createElement("button");
            row.type = "button";
            row.tabIndex = -1;
            row.className = i === active ? "typeahead-item typeahead-item-active" : "typeahead-item";
            row.textContent = o.label;
            row.addEventListener("mousedown", (e) => {
                e.preventDefault();
                commit(o);
            });
            return row;
        }));
        list.hidden = items.length === 0;
        const activeRow = list.children[active] as HTMLElement | undefined;
        activeRow?.scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("focus", () => {
        input.select();
        active = -1;
        renderList();
    });
    input.addEventListener("input", () => {
        active = -1;
        renderList();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (list.hidden) { renderList(); return; }
            active = Math.min(active + 1, items.length - 1);
            renderList();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            active = Math.max(active - 1, 0);
            renderList();
        } else if (e.key === "Enter") {
            if (list.hidden) return;
            e.preventDefault();
            const pick = items[active === -1 ? 0 : active];
            if (pick) commit(pick);
        } else if (e.key === "Escape") {
            input.value = labelFor(selected);
            close();
        }
    });
    input.addEventListener("blur", () => {
        const exact = exactTypeaheadMatch(options, input.value);
        if (exact) {
            commit(exact);
            return;
        }
        input.value = labelFor(selected);
        close();
    });

    return {
        setValue(value: string): void {
            selected = value;
            input.value = labelFor(value);
        },
        value(): string {
            return selected;
        },
    };
}
