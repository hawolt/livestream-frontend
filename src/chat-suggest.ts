export interface ReplaceRange {
    start: number;
    end: number;
}

export function wrapIndex(index: number, delta: number, length: number): number {
    if (length <= 0) return -1;
    return (((index + delta) % length) + length) % length;
}

export function applyReplacement(value: string, range: ReplaceRange, insertText: string): { value: string; end: number } {
    return {
        value: value.slice(0, range.start) + insertText + value.slice(range.end),
        end: range.start + insertText.length,
    };
}
