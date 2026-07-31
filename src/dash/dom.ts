export const $  = (id: string) => document.getElementById(id) as HTMLElement;
export const $$ = (sel: string) => document.querySelectorAll<HTMLElement>(sel);
