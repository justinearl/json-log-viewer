import { useEffect, useMemo, useState } from 'react';
import { LogTable } from './filebeatTableComponents';
import { LogEntry } from './customTypes';
import { flattenMap } from './utils';


function processLogs(logs: string) {
  let result: LogEntry[] = []

  logs.split("\n").forEach(line => {
    try {
      const testJson = JSON.parse(line)
      result.push(flattenMap(testJson))
    } catch {
      // nothing
    }
  })
  return result
}


function App() {
  const [logs, setLogs] = useState('')

  useEffect(
    () => {
      const handleMessage = (event: MessageEvent) => {
        const message = event.data
        if (message.command === "initialData") {
          setLogs(message.data || "")
        }
      };
      window.addEventListener('message', handleMessage)

      return () => {
        window.removeEventListener("message", handleMessage)
      }
    },
    []
  )

  const parsedLogs = useMemo(() => processLogs(logs), [logs])

  return (
    <div className="App">
          <LogTable content={parsedLogs}></LogTable>
    </div>
  );
}

export default App;
