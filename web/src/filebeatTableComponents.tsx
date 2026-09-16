import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import JsonView from "react18-json-view";
import 'react18-json-view/src/style.css';
import { TableVirtuoso, Virtuoso } from 'react-virtuoso';
import { LogEntry, ProcessedLogs } from "./customTypes";
import { HeaderActionKind, headerReducer } from "./headerReducer";
import { Filter, FilterActionKind, filterReducer } from "./filter";
import { copyToClipboard, detectColumns, detectTimestampKey } from "./utils";
import { matchesSearch, matchesWhere, parseQuery } from "./query";
import { computeFieldStats, FieldStat } from "./fieldStats";
import { buildHistogram, describeInterval } from "./histogram";

const LEVEL_KEYS = ['log.level', 'level', 'severity', 'loglevel'];
const BUCKET_COUNT = 18;

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

function pad(n: number, width = 2): string {
    return String(n).padStart(width, '0');
}

function formatClock(ms: number, withMillis = true): string {
    const d = new Date(ms);
    const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return withMillis ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

function formatDay(ms: number): string {
    const d = new Date(ms);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
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

/* ------------------------------------------------------------- raw event */

function RawEvent({ entry, term, levelKey }: { entry: LogEntry; term: string; levelKey: string | null }) {
    const keys = Object.keys(entry);
    return (
        <div className="raw">
            <span className="p">{'{'}</span>
            {keys.map((key, i) => {
                const value = entry[key];
                const bare = typeof value === 'number' || typeof value === 'boolean' || value === null;
                const text = bare ? String(value) : formatCell(value);
                const levelClass = key === levelKey ? getLevelClass(text) : '';
                return (
                    <span key={key}>
                        <span className="k">"{highlight(key, term)}"</span>
                        <span className="p">:</span>
                        {bare
                            ? <span className="n">{highlight(text, term)}</span>
                            : <span className={levelClass || 's'}>"{highlight(text, term)}"</span>}
                        {i < keys.length - 1 && <span className="p">,</span>}
                    </span>
                );
            })}
            <span className="p">{'}'}</span>
        </div>
    );
}

/* --------------------------------------------------------------- details */

function EntryDetail({ entry, onCopy, onCollapse, onInclude, onExclude, copied }: {
    entry: LogEntry;
    onCopy: () => void;
    onCollapse: () => void;
    onInclude: (key: string, value: string) => void;
    onExclude: (key: string, value: string) => void;
    copied: boolean;
}) {
    const keys = Object.keys(entry);
    return (
        <div className="detail" onClick={e => e.stopPropagation()}>
            <div className="detail-head">
                <span className="section-label">EXPANDED · {keys.length} FIELDS</span>
                <span className="spacer" />
                <button className="btn small" onClick={onCopy}>{copied ? 'Copied' : 'Copy JSON'}</button>
                <button className="btn small" onClick={onCollapse}>Collapse</button>
            </div>
            <div className="detail-grid">
                {keys.map(key => {
                    const value = entry[key];
                    const bare = typeof value === 'number' || typeof value === 'boolean';
                    const text = formatCell(value);
                    return [
                        <span className="k" key={`${key}-k`}>{key}</span>,
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

/* ------------------------------------------------------------- histogram */

function HistogramChart({ entries, timestampKey, levelKey }: {
    entries: LogEntry[];
    timestampKey: string | null;
    levelKey: string | null;
}) {
    const hist = useMemo(
        () => buildHistogram(entries, timestampKey, levelKey, BUCKET_COUNT),
        [entries, timestampKey, levelKey]
    );
    if (!hist) return null;

    const peak = Math.max(...hist.buckets.map(b => b.total), 1);
    const totals = hist.buckets.reduce(
        (acc, b) => ({ error: acc.error + b.error, warn: acc.warn + b.warn, other: acc.other + b.other }),
        { error: 0, warn: 0, other: 0 }
    );
    const ticks = Array.from({ length: 5 }, (_, i) => hist.start + ((hist.end - hist.start) * i) / 4);

    return (
        <div className="histogram">
            <div className="histogram-head">
                <span className="section-label">
                    EVENTS OVER TIME · {describeInterval(hist.interval).toUpperCase()} BUCKETS
                </span>
                <div className="legend">
                    <span><i style={{ background: 'var(--chart-error)' }} />error {totals.error}</span>
                    <span><i style={{ background: 'var(--chart-warn)' }} />warn {totals.warn}</span>
                    <span><i style={{ background: 'var(--chart-other)' }} />other {totals.other}</span>
                </div>
            </div>
            <div className="bars">
                {hist.buckets.map((bucket, i) => (
                    <div
                        className="bar-stack"
                        key={i}
                        title={`${formatClock(bucket.start, false)} — ${bucket.total} entries (${bucket.error} error, ${bucket.warn} warn)`}
                    >
                        {bucket.error > 0 && <i style={{ height: `${(bucket.error / peak) * 100}%`, background: 'var(--chart-error)' }} />}
                        {bucket.warn > 0 && <i style={{ height: `${(bucket.warn / peak) * 100}%`, background: 'var(--chart-warn)' }} />}
                        {bucket.other > 0 && <i style={{ height: `${(bucket.other / peak) * 100}%`, background: 'var(--chart-other)' }} />}
                    </div>
                ))}
            </div>
            <div className="axis">
                {ticks.map((tick, i) => <span key={i}>{formatClock(tick, hist.interval < 1000)}</span>)}
            </div>
        </div>
    );
}

/* --------------------------------------------------------------- sidebar */

function FieldsPanel({ stats, selected, onToggleColumn, onIncludeValue }: {
    stats: FieldStat[];
    selected: string[];
    onToggleColumn: (key: string) => void;
    onIncludeValue: (key: string, value: string) => void;
}) {
    const [filterText, setFilterText] = useState('');
    const [openField, setOpenField] = useState<string | null>(null);

    const visible = useMemo(() => {
        const needle = filterText.trim().toLowerCase();
        return needle ? stats.filter(s => s.key.toLowerCase().includes(needle)) : stats;
    }, [stats, filterText]);

    const selectedSet = useMemo(() => new Set(selected), [selected]);
    const chosen = visible.filter(s => selectedSet.has(s.key));
    const rest = visible.filter(s => !selectedSet.has(s.key));

    const renderRow = (stat: FieldStat, isSelected: boolean) => (
        <div key={stat.key}>
            <button
                className={openField === stat.key ? 'field-row open' : 'field-row'}
                onClick={() => setOpenField(openField === stat.key ? null : stat.key)}
            >
                <span className="type">{stat.type === 'number' ? '#' : stat.type === 'time' ? 't' : 'a'}</span>
                <span className="name" title={stat.key}>{stat.key}</span>
                <span className="count">{stat.capped ? '100+' : stat.distinct}</span>
            </button>
            {openField === stat.key && (
                <div className="field-detail">
                    <div className="caption">
                        {stat.topValues.length > 0
                            ? `Top ${stat.topValues.length} value${stat.topValues.length > 1 ? 's' : ''}`
                            : 'No values in the current results'}
                    </div>
                    {stat.topValues.length > 0 && (
                        <div className="top-values">
                            {stat.topValues.map(top => (
                                <div className="top-value" key={top.value}>
                                    <div className="line">
                                        <span
                                            className="val"
                                            title={`Filter for ${top.value}`}
                                            onClick={() => onIncludeValue(stat.key, top.value)}
                                        >
                                            {top.value === '' ? '(empty)' : top.value}
                                        </span>
                                        <span className="pct">{top.percent.toFixed(1)}%</span>
                                    </div>
                                    <div className="meter"><i style={{ width: `${top.percent}%` }} /></div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="actions">
                        <button className="btn small" onClick={() => onToggleColumn(stat.key)}>
                            {isSelected ? 'Remove column' : 'Add as column'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <aside className="fields">
            <div className="field">
                <Icon.search />
                <input
                    type="text"
                    placeholder="Filter field names"
                    value={filterText}
                    onChange={e => setFilterText(e.target.value)}
                />
            </div>

            {chosen.length > 0 && (
                <div className="field-group">
                    <span className="section-label">SELECTED FIELDS · {chosen.length}</span>
                    {chosen.map(stat => renderRow(stat, true))}
                </div>
            )}

            <div className="field-group">
                <span className="section-label">INTERESTING FIELDS · {rest.length}</span>
                {rest.map(stat => renderRow(stat, false))}
            </div>
        </aside>
    );
}

/* ------------------------------------------------------------------ main */

type Tab = 'events' | 'table';

type VirtualItem =
    | { kind: 'row'; entry: LogEntry; idx: number }
    | { kind: 'detail'; entry: LogEntry; idx: number };

export function LogTable({ data, isLoading }: { data: ProcessedLogs; isLoading: boolean }) {
    const { entries, skippedLines, allKeys } = data;
    const [currentHeaders, headerDispatch] = useReducer(headerReducer, ["level", "message"]);
    const [contentFilters, filterDispatch] = useReducer(filterReducer, [] as Filter[]);
    const [tab, setTab] = useState<Tab>('events');
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortAscending, setSortAscending] = useState(true);
    const [queryText, setQueryText] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
    const [focusedRow, setFocusedRow] = useState(-1);
    const [tailMode, setTailMode] = useState(false);
    const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo, setTimeTo] = useState('');
    const [columnsDetected, setColumnsDetected] = useState(false);
    const [copyFeedback, setCopyFeedback] = useState<number | null>(null);

    const listRef = useRef<any>(null);
    const resizingRef = useRef<{ header: string; startX: number; startW: number } | null>(null);

    const timestampKey = useMemo(() => detectTimestampKey(entries), [entries]);
    const levelKey = useMemo(() => detectLevelKey(allKeys), [allKeys]);

    useEffect(() => {
        if (entries.length > 0 && !columnsDetected) {
            headerDispatch({ type: HeaderActionKind.SET, headers: detectColumns(entries) });
            setColumnsDetected(true);
        }
    }, [entries, columnsDetected]);

    const parsed = useMemo(() => parseQuery(queryText), [queryText]);

    const sortField = parsed.sortField ?? sortColumn;
    const sortAsc = parsed.sortField ? parsed.sortAscending : sortAscending;

    const displayContent = useMemo(() => {
        let result = entries.filter(entry => {
            if (!contentFilters.every(f => f.isValid(entry))) return false;
            if (!matchesSearch(entry, parsed.search)) return false;
            if (!matchesWhere(entry, parsed.where)) return false;
            if (timestampKey && (timeFrom || timeTo)) {
                const ts = Date.parse(String(entry[timestampKey]));
                if (isNaN(ts)) return false;
                if (timeFrom && ts < new Date(timeFrom).getTime()) return false;
                if (timeTo && ts > new Date(timeTo).getTime()) return false;
            }
            return true;
        });

        if (sortField !== null) {
            result = [...result].sort((a, b) => {
                const aVal = a[sortField] ?? "";
                const bVal = b[sortField] ?? "";
                const aNum = Number(aVal);
                const bNum = Number(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) return sortAsc ? aNum - bNum : bNum - aNum;
                const cmp = String(aVal).localeCompare(String(bVal));
                return sortAsc ? cmp : -cmp;
            });
        }
        return result;
    }, [entries, contentFilters, parsed, sortField, sortAsc, timestampKey, timeFrom, timeTo]);

    const fieldStats = useMemo(
        () => computeFieldStats(displayContent, allKeys, timestampKey),
        [displayContent, allKeys, timestampKey]
    );

    const virtualItems = useMemo(() => {
        const items: VirtualItem[] = [];
        displayContent.forEach((entry, i) => {
            items.push({ kind: 'row', entry, idx: i });
            if (expandedRows.has(i)) items.push({ kind: 'detail', entry, idx: i });
        });
        return items;
    }, [displayContent, expandedRows]);

    const tailTarget = tab === 'events' ? displayContent.length - 1 : virtualItems.length - 1;
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

    const copyAll = useCallback(() => {
        copyToClipboard(displayContent.map(entry => JSON.stringify(entry)).join('\n'));
        setCopyFeedback(-2);
        setTimeout(() => setCopyFeedback(null), 1500);
    }, [displayContent]);

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
    }, [focusedRow, displayContent, toggleRow, doCopy]);

    useEffect(() => {
        if (focusedRow < 0) return;
        const index = tab === 'events'
            ? focusedRow
            : virtualItems.findIndex(v => v.kind === 'row' && v.idx === focusedRow);
        if (index >= 0) listRef.current?.scrollToIndex({ index, align: 'center' });
    }, [focusedRow, virtualItems, tab]);

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

    const queryPlaceholder = 'Search, or field:value  |  where log.level in [ERROR, FATAL]  |  sort @timestamp desc';

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
                    <button className="btn" onClick={copyAll}>
                        {copyFeedback === -2 ? 'Copied' : 'Copy all JSON'}
                    </button>
                </div>

                <div className="query-row">
                    <textarea
                        className="query-input"
                        rows={1}
                        spellCheck={false}
                        placeholder={queryPlaceholder}
                        value={queryText}
                        onChange={e => setQueryText(e.target.value)}
                    />
                    {timestampKey && (
                        <div className="field">
                            <label htmlFor="time-from">From</label>
                            <input id="time-from" type="datetime-local" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} />
                            <span className="divider" />
                            <label htmlFor="time-to">To</label>
                            <input id="time-to" type="datetime-local" value={timeTo} onChange={e => setTimeTo(e.target.value)} />
                        </div>
                    )}
                    {(timeFrom || timeTo) && (
                        <button className="btn" onClick={() => { setTimeFrom(''); setTimeTo(''); }}>Clear</button>
                    )}
                </div>

                {parsed.errors.length > 0 ? (
                    <div className="query-errors">
                        {parsed.errors.map((message, i) => <span key={i}>{message}</span>)}
                    </div>
                ) : (
                    <div className="query-hint">
                        Stages: <code>| where field = value</code>, <code>| where field in [a, b]</code>, <code>| sort field desc</code>
                    </div>
                )}

                <div className="tabs">
                    <button className={tab === 'events' ? 'tab on' : 'tab'} onClick={() => setTab('events')}>
                        Events <span className="count">{displayContent.length.toLocaleString()}</span>
                    </button>
                    <button className={tab === 'table' ? 'tab on' : 'tab'} onClick={() => setTab('table')}>
                        Table
                    </button>
                    <span className="spacer" />
                    <div className="tabs-aside">
                        {sortField && (
                            <span className="sort-note">Sorted by {sortField} {sortAsc ? '↑' : '↓'}</span>
                        )}
                        {tab === 'table' && availableColumns.length > 0 && (
                            <select
                                className="field"
                                style={{ height: 28 }}
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
                <span className="result-count">
                    Showing <b>{displayContent.length.toLocaleString()}</b> of {entries.length.toLocaleString()}
                </span>
            </div>

            <div className="workspace">
                <div className="results">
                    <HistogramChart entries={displayContent} timestampKey={timestampKey} levelKey={levelKey} />

                    {displayContent.length === 0 ? (
                        <div className="state">
                            <Icon.noMatch />
                            <div className="title">No entries match</div>
                            <div className="detail">
                                {entries.length.toLocaleString()} entries were read, but none survive the current
                                query, filters and time range.
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
                                {queryText && <button className="btn" onClick={() => setQueryText('')}>Clear query</button>}
                                {(timeFrom || timeTo) && (
                                    <button className="btn" onClick={() => { setTimeFrom(''); setTimeTo(''); }}>
                                        Reset time range
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : tab === 'events' ? (
                        <div className="events">
                            <Virtuoso
                                ref={listRef}
                                style={{ height: '100%' }}
                                data={displayContent}
                                followOutput={tailMode ? 'smooth' : false}
                                itemContent={(index, entry) => {
                                    const stamp = timestampKey ? Date.parse(String(entry[timestampKey])) : NaN;
                                    return (
                                        <div
                                            className={index === focusedRow ? 'event focused' : 'event'}
                                            onClick={() => setFocusedRow(index)}
                                            onDoubleClick={() => toggleRow(index)}
                                        >
                                            <div className="event-time">
                                                {isNaN(stamp)
                                                    ? <span>—</span>
                                                    : <><span>{formatDay(stamp)}</span><span>{formatClock(stamp)}</span></>}
                                            </div>
                                            <div className="event-body">
                                                <RawEvent entry={entry} term={parsed.search.term} levelKey={levelKey} />
                                                {expandedRows.has(index) && (
                                                    <EntryDetail
                                                        entry={entry}
                                                        copied={copyFeedback === index}
                                                        onCopy={() => doCopy(entry, index)}
                                                        onCollapse={() => toggleRow(index)}
                                                        onInclude={(k, v) => addFilter(k, v, 'include')}
                                                        onExclude={(k, v) => addFilter(k, v, 'exclude')}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                }}
                            />
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
                                            <th key={header} style={columnWidths[header] ? { width: columnWidths[header] } : undefined}>
                                                <span
                                                    style={{ cursor: 'pointer' }}
                                                    onDoubleClick={() => columnSort(header)}
                                                    title="Double-click to sort"
                                                >
                                                    {header}
                                                    {sortField === header && (
                                                        <span className="sort-arrow">{sortAsc ? ' ▲' : ' ▼'}</span>
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
                                                <div className="resize-handle" onMouseDown={e => handleResizeStart(header, e)} />
                                            </th>
                                        ))}
                                    </tr>
                                )}
                                itemContent={(_index, item) => {
                                    if (item.kind === 'detail') {
                                        return (
                                            <td colSpan={currentHeaders.length}>
                                                <div className="detail">
                                                    <div className="detail-head">
                                                        <span className="section-label">
                                                            ENTRY · {Object.keys(item.entry).length} FIELDS
                                                        </span>
                                                        <span className="spacer" />
                                                        <button className="btn small" onClick={() => doCopy(item.entry, item.idx)}>
                                                            {copyFeedback === item.idx ? 'Copied' : 'Copy JSON'}
                                                        </button>
                                                        <button className="btn small" onClick={() => toggleRow(item.idx)}>Collapse</button>
                                                    </div>
                                                    <div className="detail-json">
                                                        <JsonView
                                                            src={item.entry}
                                                            theme="default"
                                                            collapsed={false}
                                                            collapseStringsAfterLength={80}
                                                            style={{ backgroundColor: 'transparent' }}
                                                            customizeNode={param => {
                                                                const node = param.node;
                                                                if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
                                                                    const key = param.indexOrName?.toString() ?? "";
                                                                    return (
                                                                        <span>
                                                                            {String(node)}
                                                                            <button
                                                                                className="tweak"
                                                                                onClick={e => { e.stopPropagation(); toggleColumn(key); }}
                                                                                title={currentHeaders.includes(key) ? "Remove column" : "Add as column"}
                                                                            >
                                                                                {currentHeaders.includes(key) ? '−' : '＋'}
                                                                            </button>
                                                                        </span>
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>
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
                                                    <td
                                                        key={header}
                                                        className={isNumeric ? 'numeric' : undefined}
                                                        style={columnWidths[header] ? { width: columnWidths[header] } : undefined}
                                                        title={text}
                                                    >
                                                        <span className={levelClass || undefined}>{highlight(text, parsed.search.term)}</span>
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

                {tab === 'events' && displayContent.length > 0 && (
                    <FieldsPanel
                        stats={fieldStats}
                        selected={currentHeaders}
                        onToggleColumn={toggleColumn}
                        onIncludeValue={(key, value) => addFilter(key, value, 'include')}
                    />
                )}
            </div>

            <div className="status-bar">
                <span>Total: {entries.length.toLocaleString()}</span>
                <span>Showing: {displayContent.length.toLocaleString()}</span>
                {skippedLines > 0 && <span>Skipped: {skippedLines} non-JSON lines</span>}
                {timestampKey && <span>Time field: {timestampKey}</span>}
                {sortField && <span>Sort: {sortField} {sortAsc ? '↑' : '↓'}</span>}
                <span className="spacer" />
                <span className="hint">↑↓ navigate · Enter expand · Esc collapse · ⌘C copy entry</span>
            </div>
        </div>
    );
}
