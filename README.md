# logviewer README

View JSON like logfile in table format.

Files that contains logs like this

```log
{"message": "...", "..."}
{"message": "...", "..."}
{"message": "...", "..."}
{"message": "...", "..."}
```

can be viewed in table format


Download the vsix file

```bash
DOWNLOAD_URL=$(curl -s https://api.github.com/repos/justinearl/json-log-viewer/releases/latest | jq -r '.assets[] | select(.name | endswith("vsix")) | .browser_download_url')
curl -L -o logviewer-latest.vsix "$DOWNLOAD_URL"
```

Then install in vscode

```bash
code --install-extension logviewer-latest.vsix
```

## Features

- Open a file from the explorer or editor context menu (`Open in JSON Log Viewer`), from the command palette, or with `Open With… > JSON Log Viewer` on `.log`, `.jsonl` and `.ndjson` files
- Follows the file as it grows: only new lines are read, and Tail mode keeps the newest entry in view
- Search all fields, or one field with `field:value`
- Click a level chip (ERROR, WARN, INFO, …) to show only those entries
- Filter for or against a value with the `+` / `-` buttons on any cell
- Sort by any column by double clicking on a header
- Time gaps between consecutive entries are shown next to the timestamp
- Lines that are not JSON (stack traces, plain text) are kept as plain-text rows and can be hidden
- Expand a row (double click or `Enter`) to see every field, copy it as JSON, add a field as a column, or open that line in the text editor (`O`)
- Add, remove and reorder columns
- Columns, sort, search and filters are remembered per file

## Development

### Bundle React

`npm start`

### Test extension in local

`F5`

### Create a vsix file

`vsce package`
