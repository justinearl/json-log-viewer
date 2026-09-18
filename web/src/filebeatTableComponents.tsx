import { useCallback, useDeferredValue, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TableVirtuoso } from 'react-virtuoso';
import { LINE, LogEntry, LogStore, RAW } from "./customTypes";
import { HeaderActionKind, headerReducer } from "./headerReducer";
import { applyFilters, Filter, FilterActionKind, filterReducer, FilterSpec } from "./filter";
import { copyToClipboard, detectColumns, detectTimestampKey, formatCell, formatDelta, parseTimestamp } from "./utils";
import { matchesSearch, parseSearch } from "./search";
import { detectLevelKey, getLevelClass, levelRank } from "./levels";
import { vscode } from "./vscode";

const DEFAULT_HEADERS = ["level", "message"];
const LAYOUT_SAVE_DELAY_MS = 300;

/** Everything about the view that is worth remembering per file. */
export interface Layout {
    headers: string[];
    sortColumn: string | null;
    sortAscending: boolean;
    searchText: string;
    filters: FilterSpec[];
    tailMode: boolean;
    showRaw: boolean;
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

function lineOf(entry: LogEntry): number {
    return entry[LINE] ?? -1;
}

/* ------------------------------------------------------------------ icons */

const Icon = {
    search: () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" />
        </svg>
    ),
    file: () => (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
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
    open: () => (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v6H5V6h6" />
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

/* ---------------------------------------------------------------- states */

export function LoadingState() {
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

/* --------------------------------------------------------------- details */

function EntryDetail({ entry, columns, copied, onCopy, onCollapse, onReveal, onInclude, onExclude, onToggleColumn }: {
    entry: LogEntry;
    columns: string[];
    copied: boolean;
    onCopy: () => void;
    onCollapse: () => void;
    onReveal: () => void;
    onInclude: (key: string, value: string) => void;
    onExclude: (key: string, value: string) => void;
    onToggleColumn: (key: string) => void;
}) {
    const keys = Object.keys(entry);
    const line = lineOf(entry);
    return (
        <div className="detail" onClick={e => e.stopPropagation()}>
            <div className="detail-head">
                <span className="section-label">{entry[RAW] ? 'PLAIN TEXT' : `${keys.length} FIELDS`}</span>
                {line > 0 && <span className="line-badge">line {line}</span>}
                <span className="spacer" />
                {line > 0 && (
                    <button className="btn small" onClick={onReveal} title="Show this line in the text editor">
                        <Icon.open />Open in editor
                    </button>
                )}
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

interface VirtualItem {
    kind: 'row' | 'detail';
    entry: LogEntry;
    /** Position in the filtered list, for delta and keyboard navigation. */
    idx: number;
    line: number;
}

interface LevelCount {
    value: string;
    count: number;
}

export function LogTable({ data, initialLayout }: { data: LogStore; initialLayout?: Partial<Layout> }) {
    const { entries, allKeys, rawCount } = data;

    const [currentHeaders, headerDispatch] = useReducer(headerReducer, initialLayout?.headers ?? DEFAULT_HEADERS);
    const [columnsDetected, setColumnsDetected] = useState(Boolean(initialLayout?.headers?.length));
    const [filters, filterDispatch] = useReducer(filterReducer, initialLayout?.filters, specs => (specs ?? []).map(Filter.from));
    const [sortColumn, setSortColumn] = useState<string | null>(initialLayout?.sortColumn ?? null);
    const [sortAscending, setSortAscending] = useState(initialLayout?.sortAscending ?? true);
    const [searchText, setSearchText] = useState(initialLayout?.searchText ?? '');
    const [tailMode, setTailMode] = useState(initialLayout?.tailMode ?? false);
    const [showRaw, setShowRaw] = useState(initialLayout?.showRaw ?? true);

    const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
    const [focusedLine, setFocusedLine] = useState<number | null>(null);
    const [copiedLine, setCopiedLine] = useState<number | null>(null);

    const listRef = useRef<any>(null);
    const scrollToFocusRef = useRef(false);

    /* ------------------------------------------------------------ derive */

    const levelKey = useMemo(() => detectLevelKey(allKeys), [allKeys]);
    const timestampKey = useMemo(() => detectTimestampKey(entries), [entries]);

    useEffect(() => {
        if (entries.length > 0 && !columnsDetected) {
            const sample = entries.filter(entry => !entry[RAW]).slice(0, 100);
            headerDispatch({ type: HeaderActionKind.SET, headers: detectColumns(sample) });
            setColumnsDetected(true);
        }
    }, [entries, columnsDetected]);

    useEffect(() => {
        const layout: Layout = {
            headers: currentHeaders,
            sortColumn,
            sortAscending,
            searchText,
            filters: filters.map(f => f.toJSON()),
            tailMode,
            showRaw,
        };
        const timer = setTimeout(() => vscode.postMessage({ command: 'saveLayout', layout }), LAYOUT_SAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [currentHeaders, sortColumn, sortAscending, searchText, filters, tailMode, showRaw]);

    // Typing stays responsive; the filter catches up a frame later.
    const deferredSearch = useDeferredValue(searchText);
    const search = useMemo(() => parseSearch(deferredSearch), [deferredSearch]);

    const displayContent = useMemo(() => {
        let result = entries.filter(entry =>
            (showRaw || !entry[RAW]) && applyFilters(entry, filters) && matchesSearch(entry, search)
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
    }, [entries, filters, search, sortColumn, sortAscending, showRaw]);

    const levelCounts = useMemo<LevelCount[]>(() => {
        if (!levelKey) return [];
        const counts = new Map<string, number>();
        for (const entry of entries) {
            if (entry[RAW]) continue;
            const value = entry[levelKey];
            if (value === undefined || value === null) continue;
            const text = String(value);
            counts.set(text, (counts.get(text) ?? 0) + 1);
        }
        return Array.from(counts.entries())
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => levelRank(a.value) - levelRank(b.value) || b.count - a.count);
    }, [entries, levelKey]);

    const virtualItems = useMemo(() => {
        const items: VirtualItem[] = [];
        displayContent.forEach((entry, idx) => {
            const line = lineOf(entry);
            items.push({ kind: 'row', entry, idx, line });
            if (expanded.has(line)) items.push({ kind: 'detail', entry, idx, line });
        });
        return items;
    }, [displayContent, expanded]);

    const availableColumns = useMemo(
        () => allKeys.filter(k => !currentHeaders.includes(k)),
        [allKeys, currentHeaders]
    );

    // Gaps only mean something in file order or when sorted by time.
    const showDelta = timestampKey !== null && (sortColumn === null || sortColumn === timestampKey);

    /* ----------------------------------------------------------- effects */

    useEffect(() => {
        if (tailMode && virtualItems.length > 0) {
            listRef.current?.scrollToIndex({ index: virtualItems.length - 1, behavior: 'smooth' });
        }
    }, [tailMode, virtualItems.length]);

    useEffect(() => {
        if (focusedLine === null || !scrollToFocusRef.current) return;
        scrollToFocusRef.current = false;
        const index = virtualItems.findIndex(v => v.kind === 'row' && v.line === focusedLine);
        if (index >= 0) listRef.current?.scrollToIndex({ index, align: 'center' });
    }, [focusedLine, virtualItems]);

    /* ---------------------------------------------------------- handlers */

    const toggleRow = useCallback((line: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(line)) next.delete(line); else next.add(line);
            return next;
        });
    }, []);

    const doCopy = useCallback((entry: LogEntry) => {
        copyToClipboard(entry[RAW] ? String(entry.message) : JSON.stringify(entry, null, 2));
        setCopiedLine(lineOf(entry));
        setTimeout(() => setCopiedLine(null), 1500);
    }, []);

    const reveal = useCallback((line: number) => {
        if (line > 0) vscode.postMessage({ command: 'reveal', line });
    }, []);

    const addFilter = useCallback((key: string, value: string, option: 'include' | 'exclude') => {
        filterDispatch({ type: FilterActionKind.ADD, filter: new Filter(key, value, option) });
    }, []);

    const toggleLevel = useCallback((value: string) => {
        if (!levelKey) return;
        const active = filters.find(f => f.option === 'include' && f.key === levelKey && f.value === value);
        if (active) filterDispatch({ type: FilterActionKind.DELETE, filter: active });
        else filterDispatch({ type: FilterActionKind.ADD, filter: new Filter(levelKey, value, 'include') });
    }, [filters, levelKey]);

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
        if (displayContent.length === 0) return;

        const current = focusedLine === null ? -1 : displayContent.findIndex(entry => lineOf(entry) === focusedLine);
        const focusAt = (idx: number) => {
            scrollToFocusRef.current = true;
            setFocusedLine(lineOf(displayContent[idx]));
        };

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusAt(Math.min(current + 1, displayContent.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusAt(Math.max(current - 1, 0));
        } else if (e.key === 'Enter' && focusedLine !== null) {
            e.preventDefault();
            toggleRow(focusedLine);
        } else if (e.key === 'Escape' && focusedLine !== null) {
            e.preventDefault();
            setExpanded(prev => {
                if (!prev.has(focusedLine)) return prev;
                const next = new Set(prev);
                next.delete(focusedLine);
                return next;
            });
        } else if (e.key === 'c' && (e.ctrlKey || e.metaKey) && current >= 0) {
            e.preventDefault();
            doCopy(displayContent[current]);
        } else if (e.key === 'o' && focusedLine !== null) {
            e.preventDefault();
            reveal(focusedLine);
        }
    }, [focusedLine, displayContent, toggleRow, doCopy, reveal]);

    /* ------------------------------------------------------------ render */

    if (entries.length === 0) {
        return (
            <div className="log-viewer">
                <div className="state">
                    <Icon.emptyFile />
                    <div className="title">Nothing to show yet</div>
                    <div className="detail">
                        This file is empty. New lines will appear here as they are written.
                    </div>
                    <div className="sample">{'{"@timestamp":"…","log.level":"INFO","message":"…"}'}</div>
                </div>
            </div>
        );
    }

    const isLevelActive = (value: string) =>
        filters.some(f => f.option === 'include' && f.key === levelKey && f.value === value);

    const renderCell = (item: VirtualItem, header: string) => {
        const value = item.entry[header];
        const text = formatCell(value);
        const isLevel = header === levelKey;
        const levelClass = isLevel ? getLevelClass(text) : '';
        const isNumeric = typeof value === 'number';

        let delta: React.ReactNode = null;
        if (showDelta && header === timestampKey && item.idx > 0) {
            const now = parseTimestamp(value);
            const before = parseTimestamp(displayContent[item.idx - 1][timestampKey!]);
            if (!isNaN(now) && !isNaN(before)) {
                delta = <span className="delta">{formatDelta(now - before)}</span>;
            }
        }

        return (
            <td key={header} className={isNumeric ? 'numeric' : undefined} title={text}>
                {levelClass
                    ? <span className={`level-badge ${levelClass}`}>{highlight(text, search.term)}</span>
                    : <span>{highlight(text, search.term)}</span>}
                {delta}
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
    };

    return (
        <div className="log-viewer" onKeyDown={handleKeyDown} tabIndex={0}>
            <header className="chrome">
                <div className="chrome-top">
                    <span className="product">JSON Log Viewer</span>
                    <span className="meta"><Icon.file />{entries.length.toLocaleString()} entries</span>
                    {rawCount > 0 && <span className="meta soft">{rawCount.toLocaleString()} plain-text</span>}
                    <span className="spacer" />
                    <button
                        className={tailMode ? 'btn on' : 'btn'}
                        onClick={() => setTailMode(t => !t)}
                        title="Follow new entries as they arrive"
                    >
                        <Icon.tail />Tail {tailMode ? 'on' : 'off'}
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

                {levelCounts.length > 0 && (
                    <div className="levels-row">
                        {levelCounts.map(({ value, count }) => (
                            <button
                                key={value}
                                className={isLevelActive(value) ? 'level-chip on' : 'level-chip'}
                                onClick={() => toggleLevel(value)}
                                title={isLevelActive(value) ? `Stop filtering to ${value}` : `Show only ${value}`}
                            >
                                <i className={getLevelClass(value) || 'level-other'} />
                                {value}
                                <b>{count.toLocaleString()}</b>
                            </button>
                        ))}
                        <span className="spacer" />
                        {sortColumn && (
                            <span className="sort-note">Sorted by {sortColumn} {sortAscending ? '↑' : '↓'}</span>
                        )}
                    </div>
                )}
            </header>

            <div className="filter-bar">
                <span className="section-label">FILTERS</span>
                {filters.length === 0 && (
                    <span className="chip ghost">None — use ＋ / − on any value</span>
                )}
                {filters.map(f => (
                    <span key={`${f.key}:${f.option}:${f.value}`} className="chip">
                        <span className={f.option === 'exclude' ? 'op exclude' : 'op include'}>
                            {f.option === 'exclude' ? '≠' : '='}
                        </span>
                        <span className="chip-key">{f.key}</span>
                        <span className="chip-value">{f.value}</span>
                        <button
                            onClick={() => filterDispatch({ type: FilterActionKind.DELETE, filter: f })}
                            title="Remove filter"
                        ><Icon.close /></button>
                    </span>
                ))}
                {filters.length > 1 && (
                    <button className="link" onClick={() => filterDispatch({ type: FilterActionKind.CLEAR })}>Clear all</button>
                )}
                <span className="spacer" />
                {rawCount > 0 && (
                    <button
                        className={showRaw ? 'toggle on' : 'toggle'}
                        onClick={() => setShowRaw(s => !s)}
                        title="Show or hide lines that are not JSON"
                    >
                        <i />Plain text
                    </button>
                )}
                <span className="result-count">
                    <b>{displayContent.length.toLocaleString()}</b> of {entries.length.toLocaleString()}
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
                            {filters.length > 0 && (
                                <button className="btn primary" onClick={() => filterDispatch({ type: FilterActionKind.CLEAR })}>
                                    Clear filters
                                </button>
                            )}
                            {searchText && <button className="btn" onClick={() => setSearchText('')}>Clear search</button>}
                            {!showRaw && rawCount > 0 && (
                                <button className="btn" onClick={() => setShowRaw(true)}>Show plain text</button>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="table-container">
                        <TableVirtuoso
                            ref={listRef}
                            style={{ height: '100%' }}
                            data={virtualItems}
                            computeItemKey={(_index, item) => `${item.kind}:${item.line}`}
                            followOutput={tailMode ? 'smooth' : false}
                            components={{
                                Table: ({ style, ...props }: any) => (
                                    <table {...props} className="log-table" style={{ ...style, tableLayout: 'fixed' }} />
                                ),
                                TableRow: ({ item, ...props }: any) => {
                                    const isDetail = item?.kind === 'detail';
                                    const isRaw = Boolean(item?.entry?.[RAW]);
                                    const isFocused = !isDetail && item?.line === focusedLine;
                                    return (
                                        <tr
                                            {...props}
                                            className={[
                                                props.className,
                                                isDetail ? 'detail-row' : '',
                                                isRaw && !isDetail ? 'raw-row' : '',
                                                isFocused ? 'selected' : '',
                                            ].filter(Boolean).join(' ')}
                                            onClick={!isDetail ? () => setFocusedLine(item?.line ?? null) : undefined}
                                            onDoubleClick={!isDetail ? () => toggleRow(item?.line ?? -1) : undefined}
                                        />
                                    );
                                },
                            }}
                            fixedHeaderContent={() => (
                                <tr>
                                    {currentHeaders.map(header => (
                                        <th key={header}>
                                            <span
                                                className="th-label"
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
                                                copied={copiedLine === item.line}
                                                onCopy={() => doCopy(item.entry)}
                                                onCollapse={() => toggleRow(item.line)}
                                                onReveal={() => reveal(item.line)}
                                                onInclude={(k, v) => addFilter(k, v, 'include')}
                                                onExclude={(k, v) => addFilter(k, v, 'exclude')}
                                                onToggleColumn={toggleColumn}
                                            />
                                        </td>
                                    );
                                }

                                if (item.entry[RAW]) {
                                    const text = String(item.entry.message ?? '');
                                    return (
                                        <td colSpan={currentHeaders.length} className="raw-cell" title={text}>
                                            <span className="raw-tag">txt</span>
                                            {highlight(text, search.term)}
                                        </td>
                                    );
                                }

                                return <>{currentHeaders.map(header => renderCell(item, header))}</>;
                            }}
                        />
                    </div>
                )}
            </div>

            <footer className="hint-bar">
                <span>↑↓ move</span>
                <span>Enter expand</span>
                <span>Esc collapse</span>
                <span>O open in editor</span>
                <span>⌘C copy</span>
                <span>double-click a header to sort</span>
            </footer>
        </div>
    );
}
