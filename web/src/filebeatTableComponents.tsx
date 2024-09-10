import { Dispatch, useReducer, useState } from "react";
import JsonView from "react18-json-view";
import 'react18-json-view/src/style.css'
import { LogEntry } from "./customTypes";
import { HeaderAction, HeaderActionKind, headerReducer } from "./headerReducer";


type FilterOption = 'exclude' | 'include'

class Filter {
    option: FilterOption
    key: string
    value: string

    constructor(key: string, value: string, option: FilterOption = 'exclude') {
        this.key = key
        this.value = value
        this.option = option
    }

    isValid(content: LogEntry) {
        if (this.option === "exclude") {
            return content[this.key] !== this.value
        }

        if (this.option === "include") {
            return content[this.key] === this.value
        }
    }
}

function FilterComponent(props: { filter: Filter, removeFilter: (f: Filter) => void }) {
    return (
        <div>
            <div className="my-1 mr-1 p-1 border border-gray-200 group">
                <span className="text-red-500">{props.filter.option === "exclude" ? "NOT " : ""}</span>
                <span>{`"${props.filter.key}": "${props.filter.value}"`}</span>
                <ToggleButton text="x" onclickfunc={() => props.removeFilter(props.filter)} />
            </div>
        </div>
    )
}

function LogTd(props: { text: string, header: string, filterHandler: (x: Filter) => void }) {
    let textColor = ""
    if (props.text.toUpperCase() === "ERROR") {
        textColor = "text-red-500"
    }
    if (props.text.toUpperCase() === "WARNING") {
        textColor = "text-yellow-500"
    }
    return (
        <td className='py-2 px-6 border-b border-gray-200 group'>
            <div className="flex">
                <p className={textColor + " text-wrap"}>
                    {props.text}
                </p>
                <div className="flex">
                    <div>
                        <ToggleButton text="-" onclickfunc={() => { props.filterHandler(new Filter(props.header, props.text, 'exclude')) }} />
                    </div>
                    <div>
                        <ToggleButton text="+" onclickfunc={() => { props.filterHandler(new Filter(props.header, props.text, 'include')) }} />
                    </div>
                </div>
            </div>
        </td>
    )
}

function ToggleButton(props: { text: string, onclickfunc: () => void }) {
    return (
        <button
            className="mx-0.5 px-1 py-0 invisible group-hover:visible rounded text-gray-500 hover:bg-gray-500 hover:text-white"
            onClick={props.onclickfunc}>
            {props.text}
        </button>
    )
}

function LogTh(props: { header: string, onDeleteColumn: () => void, columnSort: () => void, shiftHeaderLeft: () => void }) {
    return (
        <th className='py-3 px-6 group'>
            <div className="flex">
                <div className="font-normal text-left text-gray-600 cursor-pointer" onDoubleClick={props.columnSort}>{props.header}</div>
                <ToggleButton text="-" onclickfunc={props.onDeleteColumn} />
                <ToggleButton text="←" onclickfunc={props.shiftHeaderLeft} />
            </div>
        </th>
    )
}

function LogTHead(props: { headers: string[], headerDispatch: Dispatch<HeaderAction>, columnSort: (h: string) => void }) {

    return (
        <thead className="bg-gray-200">
            <tr>
                {props.headers.map(header => (
                    <LogTh
                        header={header}
                        key={header}
                        onDeleteColumn={() => props.headerDispatch({header: header, type: HeaderActionKind.DELETE})}
                        columnSort={() => props.columnSort(header)}
                        shiftHeaderLeft={() => props.headerDispatch({header: header, type: HeaderActionKind.SHIFT_LEFT})}
                    />
                ))}
            </tr>
        </thead>
    )
}

function LogTrDetails(props: { log: LogEntry, numCol: number, updateHeader: (s: string) => void }) {
    return (
        <tr className='border-b border-gray-200 bg-gray-100'>
            <td className="py-3 px-6" colSpan={props.numCol}>
                <div className="bg-white p-4 rounded-lg">
                    <JsonView
                        src={props.log}
                        style={{ backgroundColor: "white" }}
                        theme="default"
                        collapsed={false}
                        collapseStringsAfterLength={40}
                        customizeNode={param => {
                            if (typeof param.node === 'string' || typeof param.node === 'number' || typeof param.node === 'boolean') {
                                return (
                                    <span className="json-view--string group">
                                        {param.node}
                                        <ToggleButton text="+" onclickfunc={() => { props.updateHeader((param.indexOrName?.toString()) ?? "") }} />
                                    </span>
                                )
                            }
                        }}
                    />
                </div>
            </td>
        </tr>
    )
}

function LogTr(props: { headers: string[], log: LogEntry, filter: (x: Filter) => void, onToggleColumn: Dispatch<HeaderAction>}) {
    const [showDetail, setShowDetail] = useState(false)

    function updateHeader(toAdd: string) {
        props.onToggleColumn({
            header: toAdd,
            type: props.headers.includes(toAdd) ? HeaderActionKind.DELETE : HeaderActionKind.ADD
        })
    }

    return (
        <>
            <tr className='hover:bg-gray-100' onDoubleClick={() => setShowDetail(!showDetail)}>
                {props.headers.map(header => (
                    <LogTd
                        text={props.log[header] ?? "-"}
                        key={header}
                        header={header}
                        filterHandler={props.filter}
                    />
                ))}
            </tr>
            {showDetail ? <LogTrDetails log={props.log} updateHeader={updateHeader} numCol={props.headers.length} /> : null}
        </>
    )
}

export function LogTable(props: { content: LogEntry[] }) {
    const [currentHeaders, headerDispatch] = useReducer(headerReducer, ["level", "message"])
    const [contentFilters, setContentFilters] = useState([] as Filter[])
    const [reverseContent, setReverse] = useState(false)

    function addFilter(filter: Filter) {
        setContentFilters([...contentFilters.filter(f => !(f.key === filter.key && f.value === filter.value && f.option !== filter.option)), filter])
    }

    function removeFilter(filter: Filter) {
        setContentFilters(contentFilters.filter(f => f !== filter))
    }

    function columnSort(h: string) {
        // For a quick implementation just reverse content for now
        setReverse(!reverseContent)
    }

    function flattenMap(nested: LogEntry, prefix: string = ''): LogEntry {
        let flatMap: LogEntry = {};

        for (const key in nested) {
            if (nested.hasOwnProperty(key)) {
                const value = nested[key];
                const newKey = prefix ? `${prefix}.${key}` : key;

                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    Object.assign(flatMap, flattenMap(value, newKey));
                } else {
                    flatMap[newKey] = value;
                }
            }
        }

        return flatMap;
    }

    function getContentToDisplay() {
        let result: LogEntry[] = []
        props.content.forEach(c => {
            if (contentFilters.every(f => { return f.isValid(c) })) {
                result.push(c)
            }
        })
        return reverseContent ? result.reverse() : result
    }

    return (
        <div>
            <div className="flex flex-wrap">
                {contentFilters.map(f => (<FilterComponent key={f.key + f.option + f.value} filter={f} removeFilter={removeFilter} />))}
            </div>
            <table className='bg-white border border-gray-300 rounded-lg w-screen'>
                <LogTHead
                    headers={currentHeaders}
                    headerDispatch={headerDispatch}
                    columnSort={columnSort}
                />
                <tbody className='text-gray-600 text-sm font-light'>
                    {getContentToDisplay().map((log, index) => (
                        <LogTr
                            headers={currentHeaders}
                            log={log}
                            key={index}
                            filter={addFilter}
                            onToggleColumn={headerDispatch}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    )
}
