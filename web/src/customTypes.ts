export type LogEntry = { [key: string]: any }

export interface ProcessedLogs {
    entries: LogEntry[]
    skippedLines: number
    allKeys: string[]
}
