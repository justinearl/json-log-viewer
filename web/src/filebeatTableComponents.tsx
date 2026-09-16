import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import JsonView from "react18-json-view";
import 'react18-json-view/src/style.css';
import { TableVirtuoso } from 'react-virtuoso';
import { LogEntry, ProcessedLogs } from "./customTypes";
import { HeaderActionKind, headerReducer } from "./headerReducer";
import { Filter, FilterActionKind, filterReducer } from "./filter";
import { copyToClipboard, detectColumns, detectTimestampKey } from "./utils";

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

const LEVEL_KEYS = new Set(['level', 'log.level', 'severity', 'loglevel']);

interface SearchQuery { field: string | null; term: string }

function parseSearch(query: string): SearchQuery {
    const idx = query.indexOf(':');
    if (idx > 0 && idx < query.length - 1) {
        return { field: query.slice(0, idx), term: query.slice(idx + 1).toLowerCase() };
    }
    return { field: null, term: query.toLowerCase() };
}

function matchesSearch(entry: LogEntry, q: SearchQuery): boolean {
    if (!q.term) return true;
    if (q.field) {
        const val = entry[q.field];
        return val !== undefined && String(val).toLowerCase().includes(q.term);
    }
    return Object.values(entry).some(v => String(v).toLowerCase().includes(q.term));
}

function formatCell(val: unknown): string {
    if (val === undefined || val === null) return "-";
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return String(val);
    return JSON.stringify(val);
}

type VirtualItem =
    | { kind: 'row'; entry: LogEntry; idx: number }
    | { kind: 'detail'; entry: LogEntry; idx: number };

export function LogTable({ data, isLoading }: { data: ProcessedLogs; isLoading: boolean }) {
    const { entries, skippedLines, allKeys } = data;
    const [currentHeaders, headerDispatch] = useReducer(headerReducer, ["level", "message"]);
    const [contentFilters, filterDispatch] = useReducer(filterReducer, [] as Filter[]);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortAscending, setSortAscending] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [focusedRow, setFocusedRow] = useState(-1);
    const [tailMode, setTailMode] = useState(false);
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo, setTimeTo] = useState('');
    const [columnsDetected, setColumnsDetected] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

    const virtuosoRef = useRef<any>(null);
    const resizingRef = useRef<{ header: string; startX: number; startW: number } | null>(null);
    const timestampKey = useMemo(() => detectTimestampKey(entries), [entries]);

    useEffect(() => {
        if (entries.length > 0 && !columnsDetected) {
            headerDispatch({ type: HeaderActionKind.SET, headers: detectColumns(entries) });
            setColumnsDetected(true);
        }
    }, [entries, columnsDetected]);

    const parsedSearch = useMemo(() => parseSearch(searchQuery), [searchQuery]);

    const displayContent = useMemo(() => {
        let result = entries.filter(entry => {
            if (!contentFilters.every(f => f.isValid(entry))) return false;
            if (!matchesSearch(entry, parsedSearch)) return false;
            if (timestampKey && (timeFrom || timeTo)) {
                const ts = Date.parse(String(entry[timestampKey]));
                if (isNaN(ts)) return false;
                if (timeFrom && ts < new Date(timeFrom).getTime()) return false;
                if (timeTo && ts > new Date(timeTo).getTime()) return false;
            }
            return true;
        });

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
    }, [entries, contentFilters, parsedSearch, sortColumn, sortAscending, timestampKey, timeFrom, timeTo]);

    const virtualItems = useMemo(() => {
        const items: VirtualItem[] = [];
        displayContent.forEach((entry, i) => {
            items.push({ kind: 'row', entry, idx: i });
            if (expandedRows.has(i)) {
                items.push({ kind: 'detail', entry, idx: i });
            }
        });
        return items;
    }, [displayContent, expandedRows]);

    useEffect(() => {
        if (tailMode && virtualItems.length > 0) {
            virtuosoRef.current?.scrollToIndex({ index: virtualItems.length - 1, behavior: 'smooth' });
        }
    }, [tailMode, virtualItems.length]);

    const toggleRow = useCallback((idx: number) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }, []);

    function columnSort(h: string) {
        if (sortColumn === h) setSortAscending(!sortAscending);
        else { setSortColumn(h); setSortAscending(true); }
    }

    function doCopy(entry: LogEntry, idx: number) {
        copyToClipboard(JSON.stringify(entry, null, 2));
        setCopyFeedback(idx);
        setTimeout(() => setCopyFeedback(null), 1500);
    }

    const handleResizeStart = useCallback((header: string, e: React.MouseEvent) => {
        e.preventDefault();
        const th = (e.target as HTMLElement).parentElement;
        const startW = th?.getBoundingClientRect().width ?? 150;
        resizingRef.current = { header, startX: e.clientX, startW };

        const onMove = (ev: MouseEvent) => {
            if (!resizingRef.current) return;
            const w = Math.max(50, resizingRef.current.startW + ev.clientX - resizingRef.current.startX);
            setColumnWidths(prev => ({ ...prev, [resizingRef.current!.header]: w }));
        };
        const onUp = () => {
            resizingRef.current = null;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, []);

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
    }, [focusedRow, displayContent, toggleRow]);

    useEffect(() => {
        if (focusedRow >= 0) {
            const vIdx = virtualItems.findIndex(v => v.kind === 'row' && v.idx === focusedRow);
            if (vIdx >= 0) virtuosoRef.current?.scrollToIndex({ index: vIdx, align: 'center' });
        }
    }, [focusedRow, virtualItems]);

    const availableColumns = useMemo(
        () => allKeys.filter(k => !currentHeaders.includes(k)),
        [allKeys, currentHeaders]
    );

    if (isLoading) {
        return (
            <div className="log-viewer">
                <div className="loading-state">
                    <div className="icon">{"..."}</div>
                    <div>Loading log data...</div>
                </div>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="log-viewer">
                <div className="empty-state">
                    <div className="icon">{"{ }"}</div>
                    <div>No log entries found</div>
                    <div style={{ fontSize: 12 }}>Open a file with JSON log entries (one per line)</div>
                </div>
            </div>
        );
    }

    return (
        <div className="log-viewer" onKeyDown={handleKeyDown} tabIndex={0}>
            <div className="toolbar">
                <input
                    type="text"
                    className="search-input"
                    placeholder="Search... (field:value for specific field)"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
                {timestampKey && (
                    <div className="time-range">
                        <label>From</label>
                        <input type="datetime-local" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
                        <label>To</label>
                        <input type="datetime-local" value={timeTo} onChange={e => setTimeTo(e.target.value)} />
                        {(timeFrom || timeTo) && (
                            <button className="toolbar-btn" onClick={() => { setTimeFrom(''); setTimeTo(''); }}>Clear</button>
                        )}
                    </div>
                )}
                <button
                    className={`toolbar-btn ${tailMode ? 'active' : ''}`}
                    onClick={() => setTailMode(t => !t)}
                    title="Auto-scroll to latest entries"
                >
                    Tail {tailMode ? 'ON' : 'OFF'}
                </button>
                {availableColumns.length > 0 && (
                    <select
                        value=""
                        onChange={e => {
                            if (e.target.value) headerDispatch({ type: HeaderActionKind.ADD, header: e.target.value });
                        }}
                    >
                        <option value="">+ Add Column</option>
                        {availableColumns.map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                )}
            </div>

            {contentFilters.length > 0 && (
                <div className="filter-bar">
                    {contentFilters.map(f => (
                        <div key={`${f.key}:${f.option}:${f.value}`} className="filter-chip">
                            {f.option === 'exclude' && <span className="exclude">NOT </span>}
                            <span>{f.key}: {f.value}</span>
                            <button onClick={() => filterDispatch({ filter: f, type: FilterActionKind.DELETE })}>
                                x
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="table-container">
                <TableVirtuoso
                    ref={virtuosoRef}
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
                                    className={[props.className, isDetail ? 'detail-row' : '', isFocused ? 'selected' : ''].filter(Boolean).join(' ')}
                                    onClick={!isDetail ? () => setFocusedRow(item?.idx ?? -1) : undefined}
                                    onDoubleClick={!isDetail ? () => toggleRow(item?.idx ?? -1) : undefined}
                                />
                            );
                        },
                    }}
                    fixedHeaderContent={() => (
                        <tr>
                            {currentHeaders.map(header => (
                                <th key={header} style={columnWidths[header] ? { width: columnWidths[header] } : undefined}>
                                    <span
                                        style={{ cursor: 'pointer' }}
                                        onDoubleClick={() => columnSort(header)}
                                        title="Double-click to sort"
                                    >
                                        {header}
                                        {sortColumn === header && (sortAscending ? ' ▲' : ' ▼')}
                                    </span>
                                    <span className="th-actions">
                                        <button
                                            className="th-btn"
                                            onClick={() => headerDispatch({ type: HeaderActionKind.DELETE, header })}
                                            title="Remove column"
                                        >x</button>
                                        <button
                                            className="th-btn"
                                            onClick={() => headerDispatch({ type: HeaderActionKind.SHIFT_LEFT, header })}
                                            title="Move left"
                                        >{'←'}</button>
                                    </span>
                                    <div className="resize-handle" onMouseDown={e => handleResizeStart(header, e)} />
                                </th>
                            ))}
                        </tr>
                    )}
                    itemContent={(_index, item) => {
                        if (item.kind === 'detail') {
                            return (
                                <td colSpan={currentHeaders.length}>
                                    <div className="detail-content">
                                        <button className="copy-btn" onClick={() => doCopy(item.entry, item.idx)}>
                                            {copyFeedback === item.idx ? 'Copied!' : 'Copy JSON'}
                                        </button>
                                        <JsonView
                                            src={item.entry}
                                            theme="default"
                                            collapsed={false}
                                            collapseStringsAfterLength={80}
                                            style={{ backgroundColor: 'transparent' }}
                                            customizeNode={param => {
                                                if (typeof param.node === 'string' || typeof param.node === 'number' || typeof param.node === 'boolean') {
                                                    const key = param.indexOrName?.toString() ?? "";
                                                    return (
                                                        <span>
                                                            {String(param.node)}
                                                            <button
                                                                className="cell-btn"
                                                                onClick={e => {
                                                                    e.stopPropagation();
                                                                    headerDispatch({
                                                                        type: currentHeaders.includes(key) ? HeaderActionKind.DELETE : HeaderActionKind.ADD,
                                                                        header: key
                                                                    });
                                                                }}
                                                                title={currentHeaders.includes(key) ? "Remove column" : "Add as column"}
                                                            >
                                                                {currentHeaders.includes(key) ? '−' : '+'}
                                                            </button>
                                                        </span>
                                                    );
                                                }
                                            }}
                                        />
                                    </div>
                                </td>
                            );
                        }

                        return (
                            <>
                                {currentHeaders.map(header => {
                                    const text = formatCell(item.entry[header]);
                                    const levelClass = LEVEL_KEYS.has(header.toLowerCase()) ? getLevelClass(text) : '';
                                    return (
                                        <td
                                            key={header}
                                            style={columnWidths[header] ? { width: columnWidths[header] } : undefined}
                                            title={text}
                                        >
                                            <span className={levelClass || undefined}>{text}</span>
                                            <span className="cell-actions">
                                                <button
                                                    className="cell-btn"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        filterDispatch({ filter: new Filter(header, text, 'include'), type: FilterActionKind.ADD });
                                                    }}
                                                    title="Include"
                                                >+</button>
                                                <button
                                                    className="cell-btn"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        filterDispatch({ filter: new Filter(header, text, 'exclude'), type: FilterActionKind.ADD });
                                                    }}
                                                    title="Exclude"
                                                >{'−'}</button>
                                            </span>
                                        </td>
                                    );
                                })}
                            </>
                        );
                    }}
                />
            </div>

            <div className="status-bar">
                <span className="status-item">Total: {entries.length}</span>
                {displayContent.length !== entries.length && (
                    <span className="status-item">Showing: {displayContent.length}</span>
                )}
                {skippedLines > 0 && (
                    <span className="status-item">Skipped: {skippedLines} non-JSON lines</span>
                )}
                {timestampKey && <span className="status-item">Time field: {timestampKey}</span>}
                {sortColumn && (
                    <span className="status-item">Sort: {sortColumn} {sortAscending ? '↑' : '↓'}</span>
                )}
            </div>
        </div>
    );
}
