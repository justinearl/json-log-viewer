import { useEffect, useState } from 'react';
import { LogTable } from './filebeatTableComponents';
import { LogEntry } from './customTypes';


function processLogs(logs: string) {
  let result: LogEntry[] = []

  logs.split("\n").forEach(line => {
    try {
      const testJson = JSON.parse(line)
      result.push(testJson)
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
        setLogs(message.data || "")
      };
      window.addEventListener('message', handleMessage)

      return () => {
        window.removeEventListener("message", handleMessage)
      }
    },
    []
  )

  return (
    <div className="App">
          <LogTable content={processLogs(logs)}></LogTable>
    </div>
  );
}

export default App;
