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

- Run command by pressing `Ctrl` + `Shift` + `P` and Type `JSON Log viewer`
- Sort logs by timestamp (or by any columns) by double clicking on a header item
- View the JSON tree by double clicking on row
- Filter specified items (`+`, `-`)
- Toggle column by clicking `+` in JSON tree
- Reorder columns (`<-`)
- Immediately reflect changes on log file

## Development

### Bundle React

`npm start`

### Test extension in local

`F5`

### Create a vsix file

`vsce package`
