import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TableVirtuoso } from 'react-virtuoso';
import { LogEntry, ProcessedLogs } from "./customTypes";
import { HeaderActionKind, headerReducer } from "./headerReducer";
import { Filter, FilterActionKind, filterReducer } from "./filter";
import { copyToClipboard, detectColumns } from "./utils";
import { matchesSearch, parseSearch } from "./search";

const LEVEL_KEYS = ['log.level', 'level', 'severity', 'loglevel'];

function getLevelClass(value: string): string {
    switch (value.toUpperCase().trim()) {
        case 'FATAL': case 'CRITICAL': case 'EMERGENCY': return 'level-fatal';
        case 'ERROR': case 'ERR': return 'level-error';
        case 'WARNING': case 'WARN': return 'level-warn';
        case 'INFO': case 'INFORMATION': return 'level-info';
        case 'DEBUG': case 'DBG': return 'level-debug';
        case 'TRACE': case 'VERBOSE': return 'level-trace';
        default: return '';
    }
}

function detectLevelKey(allKeys: string[]): string | null {
    const lookup = new Map(allKeys.map(k => [k.toLowerCase(), k]));
    for (const candidate of LEVEL_KEYS) {
        const hit = lookup.get(candidate);
        if (hit) return hit;
    }
    return null;
}

function formatCell(val: unknown): string {
    if (val === undefined || val === null) return "-";
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
}

/** Splits text on a search term so matches can be wrapped in <mark>. */
function highlight(text: string, term: string): React.ReactNode {
    if (!term) return text;
    const haystack = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    let key = 0;

    for (;;) {
        const at = haystack.indexOf(term, cursor);
        if (at === -1) {
            parts.push(text.slice(cursor));
            break;
        }
        if (at > cursor) parts.push(text.slice(cursor, at));
        parts.push(<mark key={key++}>{text.slice(at, at + term.length)}</mark>);
        cursor = at + term.length;
    }
    return parts;
}

/* ------------------------------------------------------------------ icons */

const Icon = {
    search: () => (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
        </svg>
    ),
    file: () => (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" />
        </svg>
    ),
    tail: () => (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
    ),
    close: () => (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
        </svg>
    ),
    left: () => (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
    ),
    spinner: () => (
        <svg className="spin" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7a5 5 0 0 1 5 5" opacity=".35" />
        </svg>
    ),
    emptyFile: () => (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h4" />
        </svg>
    ),
    noMatch: () => (
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /><path d="M8.5 11h5" />
        </svg>
    ),
};

/* --------------------------------------------------------------- details */

function EntryDetail({ entry, columns, copied, onCopy, onCollapse, onInclude, onExclude, onToggleColumn }: {
    entry: LogEntry;
    columns: string[];
    copied: boolean;
    onCopy: () => void;
    onCollapse: () => void;
    onInclude: (key: string, value: string) => void;
    onExclude: (key: string, value: string) => void;
    onToggleColumn: (key: string) => void;
}) {
    const keys = Object.keys(entry);
    return (
        <div className="detail" onClick={e => e.stopPropagation()}>
            <div className="detail-head">
                <span className="section-label">ENTRY · {keys.length} FIELDS</span>
                <span className="spacer" />
                <button className="btn small" onClick={onCopy}>{copied ? 'Copied' : 'Copy JSON'}</button>
                <button className="btn small" onClick={onCollapse}>Collapse</button>
            </div>
            <div className="detail-grid">
                {keys.map(key => {
                    const value = entry[key];
                    const bare = typeof value === 'number' || typeof value === 'boolean';
                    const text = formatCell(value);
                    const isColumn = columns.includes(key);
                    return [
                        <span className="k" key={`${key}-k`}>
                            {key}
                            <button
                                className={isColumn ? 'tweak on' : 'tweak'}
                                title={isColumn ? 'Remove column' : 'Add as column'}
                                onClick={() => onToggleColumn(key)}
                            >col</button>
                        </span>,
                        <span key={`${key}-v`}>
                            <span className={bare ? 'v num' : 'v'}>{bare ? text : `"${text}"`}</span>
                            <button className="tweak" title="Filter for this value" onClick={() => onInclude(key, text)}>＋</button>
                            <button className="tweak" title="Filter out this value" onClick={() => onExclude(key, text)}>−</button>
                        </span>,
                    ];
                })}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ main */

type VirtualItem =
    | { kind: 'row'; entry: LogEntry; idx: number }
    | { kind: 'detail'; entry: LogEntry; idx: number };

export function LogTable({ data, isLoading }: { data: ProcessedLogs; isLoading: boolean }) {
    const { entries, skippedLines, allKeys } = data;
    const [currentHeaders, headerDispatch] = useReducer(headerReducer, ["level", "message"]);
    const [contentFilters, filterDispatch] = useReducer(filterReducer, [] as Filter[]);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortAscending, setSortAscending] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [focusedRow, setFocusedRow] = useState(-1);
    const [tailMode, setTailMode] = useState(false);
    const [columnsDetected, setColumnsDetected] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

    const listRef = useRef<any>(null);

    const levelKey = useMemo(() => detectLevelKey(allKeys), [allKeys]);

    useEffect(() => {
        if (entries.length > 0 && !columnsDetected) {
            headerDispatch({ type: HeaderActionKind.SET, headers: detectColumns(entries) });
            setColumnsDetected(true);
        }
    }, [entries, columnsDetected]);

    const search = useMemo(() => parseSearch(searchText), [searchText]);

    const displayContent = useMemo(() => {
        let result = entries.filter(entry =>
            contentFilters.every(f => f.isValid(entry)) && matchesSearch(entry, search)
        );

        if (sortColumn !== null) {
            result = [...result].sort((a, b) => {
                const aVal = a[sortColumn] ?? "";
                const bVal = b[sortColumn] ?? "";
                const aNum = Number(aVal);
                const bNum = Number(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) return sortAscending ? aNum - bNum : bNum - aNum;
                const cmp = String(aVal).localeCompare(String(bVal));
                return sortAscending ? cmp : -cmp;
            });
        }
        return result;
    }, [entries, contentFilters, search, sortColumn, sortAscending]);

    const virtualItems = useMemo(() => {
        const items: VirtualItem[] = [];
        displayContent.forEach((entry, i) => {
            items.push({ kind: 'row', entry, idx: i });
            if (expandedRows.has(i)) items.push({ kind: 'detail', entry, idx: i });
        });
        return items;
    }, [displayContent, expandedRows]);

    const tailTarget = virtualItems.length - 1;
    useEffect(() => {
        if (tailMode && tailTarget >= 0) {
            listRef.current?.scrollToIndex({ index: tailTarget, behavior: 'smooth' });
        }
    }, [tailMode, tailTarget]);

    const toggleRow = useCallback((idx: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }, []);

    const doCopy = useCallback((entry: LogEntry, idx: number) => {
        copyToClipboard(JSON.stringify(entry, null, 2));
        setCopyFeedback(idx);
        setTimeout(() => setCopyFeedback(null), 1500);
    }, []);

    const addFilter = useCallback((key: string, value: string, option: 'include' | 'exclude') => {
        filterDispatch({ filter: new Filter(key, value, option), type: FilterActionKind.ADD });
    }, []);

    const toggleColumn = useCallback((key: string) => {
        headerDispatch({
            type: currentHeaders.includes(key) ? HeaderActionKind.DELETE : HeaderActionKind.ADD,
            header: key,
        });
    }, [currentHeaders]);

    function columnSort(header: string) {
        if (sortColumn === header) setSortAscending(!sortAscending);
        else { setSortColumn(header); setSortAscending(true); }
    }

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedRow(prev => Math.min(prev + 1, displayContent.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedRow(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && focusedRow >= 0) {
            e.preventDefault();
            toggleRow(focusedRow);
        } else if (e.key === 'Escape' && focusedRow >= 0) {
            e.preventDefault();
            setExpandedRows(prev => {
                if (!prev.has(focusedRow)) return prev;
                const next = new Set(prev);
                next.delete(focusedRow);
                return next;
            });
        } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && focusedRow >= 0 && focusedRow < displayContent.length) {
            e.preventDefault();
            doCopy(displayContent[focusedRow], focusedRow);
        }
    }, [focusedRow, displayContent, toggleRow, doCopy]);

    useEffect(() => {
        if (focusedRow < 0) return;
        const index = virtualItems.findIndex(v => v.kind === 'row' && v.idx === focusedRow);
        if (index >= 0) listRef.current?.scrollToIndex({ index, align: 'center' });
    }, [focusedRow, virtualItems]);

    const availableColumns = useMemo(
        () => allKeys.filter(k => !currentHeaders.includes(k)),
        [allKeys, currentHeaders]
    );

    /* ------------------------------------------------------------- states */

    if (isLoading) {
        return (
            <div className="log-viewer">
                <div className="state">
                    <Icon.spinner />
                    <div className="title">Reading log file</div>
                    <div className="detail">Parsing entries and detecting columns.</div>
                    <div className="progress"><i /></div>
                </div>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="log-viewer">
                <div className="state">
                    <Icon.emptyFile />
                    <div className="title">No JSON log entries found</div>
                    <div className="detail">
                        This viewer expects one JSON object per line.
                        {skippedLines > 0 && ` None of the ${skippedLines} lines in this file parsed.`}
                    </div>
                    <div className="sample">{'{"@timestamp":"…","log.level":"INFO","message":"…"}'}</div>
                </div>
            </div>
        );
    }

    /* ------------------------------------------------------------- chrome */

    return (
        <div className="log-viewer" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="chrome">
                <div className="chrome-top">
                    <span className="product">JSON Log Viewer</span>
                    <span className="chip mono"><Icon.file />{entries.length.toLocaleString()} entries</span>
                    {skippedLines > 0 && <span className="source-note">{skippedLines} non-JSON lines skipped</span>}
                    <span className="spacer" />
                    <button
                        className={tailMode ? 'btn on' : 'btn'}
                        onClick={() => setTailMode(t => !t)}
                        title="Auto-scroll to latest entries"
                    >
                        <Icon.tail />Tail {tailMode ? 'ON' : 'OFF'}
                    </button>
                </div>

                <div className="search-row">
                    <div className="field search">
                        <Icon.search />
                        <input
                            type="text"
                            spellCheck={false}
                            placeholder="Search all fields, or field:value"
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                        />
                        {searchText && (
                            <button className="clear" title="Clear search" onClick={() => setSearchText('')}><Icon.close /></button>
                        )}
                    </div>
                    {availableColumns.length > 0 && (
                        <select
                            className="field"
                            value=""
                            onChange={e => {
                                if (e.target.value) headerDispatch({ type: HeaderActionKind.ADD, header: e.target.value });
                            }}
                        >
                            <option value="">+ Add column</option>
                            {availableColumns.map(k => <option key={k} value={k}>{k}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <div className="filter-bar">
                <span className="section-label">FILTERS</span>
                {contentFilters.length === 0 && (
                    <span className="chip" style={{ borderStyle: 'dashed', color: 'var(--ink-3)' }}>
                        None — use ＋ / − on any value
                    </span>
                )}
                {contentFilters.map(f => (
                    <span key={`${f.key}:${f.option}:${f.value}`} className="chip">
                        <span className={f.option === 'exclude' ? 'op exclude' : 'op include'}>
                            {f.option === 'exclude' ? '≠' : '='}
                        </span>
                        {f.key}: {f.value}
                        <button
                            onClick={() => filterDispatch({ filter: f, type: FilterActionKind.DELETE })}
                            title="Remove filter"
                        ><Icon.close /></button>
                    </span>
                ))}
                <span className="spacer" />
                {sortColumn && (
                    <span className="sort-note">Sorted by {sortColumn} {sortAscending ? '↑' : '↓'}</span>
                )}
                <span className="result-count">
                    Showing <b>{displayContent.length.toLocaleString()}</b> of {entries.length.toLocaleString()}
                </span>
            </div>

            <div className="results">
                {displayContent.length === 0 ? (
                    <div className="state">
                        <Icon.noMatch />
                        <div className="title">No entries match</div>
                        <div className="detail">
                            {entries.length.toLocaleString()} entries were read, but none survive the current
                            search and filters.
                        </div>
                        <div className="actions">
                            {contentFilters.length > 0 && (
                                <button
                                    className="btn primary"
                                    onClick={() => contentFilters.forEach(f =>
                                        filterDispatch({ filter: f, type: FilterActionKind.DELETE })
                                    )}
                                >Clear filters</button>
                            )}
                            {searchText && <button className="btn" onClick={() => setSearchText('')}>Clear search</button>}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <TableVirtuoso
                            ref={listRef}
                            style={{ height: '100%' }}
                            data={virtualItems}
                            followOutput={tailMode ? 'smooth' : false}
                            components={{
                                Table: ({ style, ...props }: any) => (
                                    <table {...props} className="log-table" style={{ ...style, tableLayout: 'fixed' }} />
                                ),
                                TableRow: ({ item, ...props }: any) => {
                                    const isDetail = item?.kind === 'detail';
                                    const isFocused = !isDetail && item?.idx === focusedRow;
                                    return (
                                        <tr
                                            {...props}
                                            className={[props.className, isDetail ? 'detail-row' : '', isFocused ? 'selected' : '']
                                                .filter(Boolean).join(' ')}
                                            onClick={!isDetail ? () => setFocusedRow(item?.idx ?? -1) : undefined}
                                            onDoubleClick={!isDetail ? () => toggleRow(item?.idx ?? -1) : undefined}
                                        />
                                    );
                                },
                            }}
                            fixedHeaderContent={() => (
                                <tr>
                                    {currentHeaders.map(header => (
                                        <th key={header}>
                                            <span
                                                style={{ cursor: 'pointer' }}
                                                onDoubleClick={() => columnSort(header)}
                                                title="Double-click to sort"
                                            >
                                                {header}
                                                {sortColumn === header && (
                                                    <span className="sort-arrow">{sortAscending ? ' ▲' : ' ▼'}</span>
                                                )}
                                            </span>
                                            <span className="th-actions">
                                                <button
                                                    className="th-btn"
                                                    onClick={() => headerDispatch({ type: HeaderActionKind.SHIFT_LEFT, header })}
                                                    title="Move left"
                                                ><Icon.left /></button>
                                                <button
                                                    className="th-btn"
                                                    onClick={() => headerDispatch({ type: HeaderActionKind.DELETE, header })}
                                                    title="Remove column"
                                                ><Icon.close /></button>
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            )}
                            itemContent={(_index, item) => {
                                if (item.kind === 'detail') {
                                    return (
                                        <td colSpan={currentHeaders.length}>
                                            <EntryDetail
                                                entry={item.entry}
                                                columns={currentHeaders}
                                                copied={copyFeedback === item.idx}
                                                onCopy={() => doCopy(item.entry, item.idx)}
                                                onCollapse={() => toggleRow(item.idx)}
                                                onInclude={(k, v) => addFilter(k, v, 'include')}
                                                onExclude={(k, v) => addFilter(k, v, 'exclude')}
                                                onToggleColumn={toggleColumn}
                                            />
                                        </td>
                                    );
                                }

                                return (
                                    <>
                                        {currentHeaders.map(header => {
                                            const text = formatCell(item.entry[header]);
                                            const isLevel = header === levelKey;
                                            const levelClass = isLevel ? getLevelClass(text) : '';
                                            const isNumeric = typeof item.entry[header] === 'number';
                                            return (
                                                <td key={header} className={isNumeric ? 'numeric' : undefined} title={text}>
                                                    <span className={levelClass || undefined}>{highlight(text, search.term)}</span>
                                                    <span className="cell-actions">
                                                        <button
                                                            className="tweak"
                                                            onClick={e => { e.stopPropagation(); addFilter(header, text, 'include'); }}
                                                            title="Filter for this value"
                                                        >＋</button>
                                                        <button
                                                            className="tweak"
                                                            onClick={e => { e.stopPropagation(); addFilter(header, text, 'exclude'); }}
                                                            title="Filter out this value"
                                                        >−</button>
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </>
                                );
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="hint-bar">↑↓ navigate · Enter expand · Esc collapse · ⌘C copy entry · double-click header to sort</div>
        </div>
    );
}
