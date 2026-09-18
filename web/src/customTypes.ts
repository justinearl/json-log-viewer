/** Source line number (1-based). A symbol key so it never shows up as a field. */
export const LINE: unique symbol = Symbol('line');
/** Set on entries that were not JSON and are shown as plain text. */
export const RAW: unique symbol = Symbol('raw');

export type LogEntry = {
    [key: string]: any;
    [LINE]?: number;
    [RAW]?: true;
};

export interface LogStore {
    entries: LogEntry[];
    allKeys: string[];
    rawCount: number;
}
