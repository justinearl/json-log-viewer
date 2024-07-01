"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogTable = LogTable;
const react_1 = require("react");
const querystring_1 = require("querystring");
const react18_json_view_1 = __importDefault(require("react18-json-view"));
require("react18-json-view/src/style.css");
class Filter {
    option;
    key;
    value;
    constructor(key, value, option = 'exclude') {
        this.key = key;
        this.value = value;
        this.option = option;
    }
    isValid(content) {
        if (this.option === "exclude") {
            return content[this.key] !== this.value;
        }
        if (this.option === "include") {
            return content[this.key] === this.value;
        }
    }
}
function FilterComponent(props) {
    return (<div>
            <div className="my-1 mr-1 p-1 border border-gray-200 group">
                <span className="text-red-500">{props.filter.option === "exclude" ? "NOT " : ""}</span>
                <span>{`"${props.filter.key}": "${props.filter.value}"`}</span>
                <ToggleButton text="x" onclickfunc={() => props.removeFilter(props.filter)}/>
            </div>
        </div>);
}
function LogTd(props) {
    let textColor = "";
    if (props.text.toUpperCase() === "ERROR") {
        textColor = "text-red-500";
    }
    if (props.text.toUpperCase() === "WARNING") {
        textColor = "text-yellow-500";
    }
    return (<td className='py-2 px-6 border-b border-gray-200 group'>
            <div className="flex">
                <p className={textColor + " text-wrap"}>
                    {props.text}
                </p>
                <div className="flex">
                    <div>
                        <ToggleButton text="-" onclickfunc={() => { props.filterHandler(new Filter(props.header, props.text, 'exclude')); }}/>
                    </div>
                    <div>
                        <ToggleButton text="+" onclickfunc={() => { props.filterHandler(new Filter(props.header, props.text, 'include')); }}/>
                    </div>
                </div>
            </div>
        </td>);
}
function ToggleButton(props) {
    return (<button className="mx-0.5 px-1 py-0 invisible group-hover:visible rounded text-gray-500 hover:bg-gray-500 hover:text-white" onClick={props.onclickfunc}>
                {props.text}
            </button>);
}
function LogTh(props) {
    return (<th className='py-3 px-6 group'>
            <div className="flex">
                <div className="font-normal text-left text-gray-600">{props.header}</div>
                <ToggleButton text="-" onclickfunc={props.columnRemover}/>
            </div>
        </th>);
}
function LogTHead(props) {
    function removeColumn(header) {
        props.headerFilter(props.headers.filter(e => e !== header));
    }
    return (<thead className="bg-gray-200">
            <tr>
                {props.headers.map(header => (<LogTh header={header} columnRemover={() => removeColumn(header)} key={header}/>))}
            </tr>
        </thead>);
}
function LogTrDetails(props) {
    return (<tr className='border-b border-gray-200 bg-gray-100'>
            <td className="py-3 px-6" colSpan={props.numCol}>
                <div className="bg-gray-50 p-4 rounded-lg">
                    <react18_json_view_1.default editable src={props.log} theme="default" collapsed={false} collapseStringsAfterLength={40} customizeNode={param => {
            if (typeof param.node === 'string') {
                return (<span className="json-view--string group">
                                            {param.node}
                                            <ToggleButton text="+" onclickfunc={() => { props.updateHeader((param.indexOrName?.toString()) ?? ""); }}/>
                                    </span>);
            }
        }}/>
                </div>
            </td>
        </tr>);
}
function LogTr(props) {
    const [showDetail, setShowDetail] = (0, react_1.useState)(false);
    function updateHeader(toAdd) {
        if (props.headers.includes(toAdd)) {
            props.headerFilter(props.headers.filter(e => e !== toAdd));
        }
        else {
            props.headerFilter([...props.headers, toAdd]);
        }
    }
    return (<>
            <tr className='hover:bg-gray-100' onDoubleClick={() => setShowDetail(!showDetail)}>
                {props.headers.map(header => (<LogTd text={props.log[header] ?? "-"} key={header} header={header} filterHandler={props.filter}/>))}
            </tr>
            {showDetail ? <LogTrDetails log={props.log} updateHeader={updateHeader} numCol={props.headers.length}/> : null}
        </>);
}
function LogTable(props) {
    const [currentHeaders, setCurrentHeaders] = (0, react_1.useState)(["level", "message"]);
    const [contentFilters, setContentFilters] = (0, react_1.useState)([]);
    function addFilter(filter) {
        setContentFilters([...contentFilters, filter]);
    }
    function removeFilter(filter) {
        setContentFilters(contentFilters.filter(f => f !== filter));
    }
    function getContentToDisplay() {
        let result = [];
        props.content.forEach(c => {
            if (contentFilters.every(f => { return f.isValid(c); })) {
                result.push(c);
            }
        });
        return result;
    }
    return (<div>
            <div className="flex flex-wrap">
                {contentFilters.map(f => (<FilterComponent key={f.key + f.option + f.value} filter={f} removeFilter={removeFilter}/>))}
            </div>
            <table className='bg-white border border-gray-300 rounded-lg'>
                <LogTHead headers={currentHeaders} headerFilter={setCurrentHeaders}/>
                <tbody className='text-gray-600 text-sm font-light'>
                    {getContentToDisplay().map(log => (<LogTr headers={currentHeaders} log={log} key={(0, querystring_1.stringify)(log)} filter={addFilter} headerFilter={setCurrentHeaders}/>))}
                </tbody>
            </table>
        </div>);
}
//# sourceMappingURL=filebeatTableComponents.js.map