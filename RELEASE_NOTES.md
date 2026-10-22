## Vali Code 1.0.0

One HTML file. No install, no network, no dependencies. Download `ValiCode.html`, drop it anywhere, double-click it.

### What it does
- **Side-by-side / unified diff** of pasted text or dropped files, with within-line highlighting, collapsed unchanged regions and next/prev navigation.
- **SSIS package compare (.dtsx)** that reads the package instead of diffing XML. Tasks, containers, event handlers, data flow components and columns, paths, connection managers, variables, parameters, precedence constraints and script code are compared object by object. GUIDs, build numbers, dates and designer layout are ignored, so a package re-saved without changes reports no functional changes. The result opens with a plain-language index (package › container › step — what changed); every code change has Differences / Old code / New code tabs.
- **Object filter** on the SSIS view by category, status and free text.
- **SQL-aware compare**: keywords and built-in functions uppercased, `[brackets]` dropped, comments ignored, canonical layout (one clause and one column per line). A reformatted copy of the same statement is identical; a real edit shows as the lines it is. Applied to SQL inside SSIS tasks too.
- **Auto-detect** of SSIS, XML, SQL or plain text from content and file name.
- **Folder compare** with drill-down into any file.
- Export as unified `.diff`, narrative text for SSIS, or standalone HTML report.

### Getting it into a locked-down desktop
1. Copy `ValiCode.html` in and open it. Runs from `file://`, nothing executes natively.
2. If only text can cross, paste the source into Notepad and save as `ValiCode.html`.
3. If the browser blocks local files, run `python serve.py` (or paste it into a Jupyter cell) and click the printed link.
