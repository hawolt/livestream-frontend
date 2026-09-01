export interface RailCardInput {
    username: string;
    title: string;
    category: string | null;
    viewers: number;
    offline: boolean;
    collapsed: boolean;
}

export interface RailCardModel {
    head: string;
    title: string;
    live: boolean;
    viewers: number;
}

export function railCardModel(input: RailCardInput): RailCardModel | null {
    const title = input.title.trim();
    if (!input.collapsed) {
        if (input.offline || !title) return null;
        return { head: "", title, live: false, viewers: 0 };
    }
    const category = input.category?.trim() ?? "";
    if (input.offline) {
        return { head: input.username, title: "", live: false, viewers: 0 };
    }
    return {
        head: category ? `${input.username} · ${category}` : input.username,
        title,
        live: true,
        viewers: input.viewers,
    };
}
