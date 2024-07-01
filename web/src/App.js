"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
require("./App.css");
const filebeatTableComponents_1 = require("./filebeatTableComponents");
function processLogs(logs) {
    let result = [];
    logs.split("\n").forEach(line => {
        try {
            const testJson = JSON.parse(line);
            result.push(testJson);
        }
        catch {
            // nothing
        }
    });
    return result;
}
function App() {
    const [logs, setLogs] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        const handleMessage = (event) => {
            const message = event.data;
            console.log(message);
            setLogs(message.data || "");
        };
        window.addEventListener('message', handleMessage);
        return () => {
            window.removeEventListener("message", handleMessage);
        };
    }, []);
    return (<div className="App">
          <filebeatTableComponents_1.LogTable content={processLogs(logs)}></filebeatTableComponents_1.LogTable>
    </div>);
}
exports.default = App;
//# sourceMappingURL=App.js.map