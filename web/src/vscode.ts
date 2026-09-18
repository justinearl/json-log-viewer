export interface VsCodeApi {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const standalone: VsCodeApi = {
    postMessage() { },
    getState() { return undefined; },
    setState() { },
};

/** The VS Code webview bridge, or a no-op stand-in when the bundle runs in a plain browser. */
export const vscode: VsCodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : standalone;
