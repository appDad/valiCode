# Vali Code

One HTML file. No install, no network, no dependencies. Open `ValiCode.html` in any
browser and compare two pieces of code, two files, or two folders. Built for a
locked-down Citrix desktop where you can bring a file in but cannot install anything.

## What it does

- **Side-by-side or unified diff** of pasted text or dropped files, with line numbers,
  changed-within-line highlighting, collapsed unchanged regions, next/prev navigation.
- **SSIS package compare (.dtsx)** that understands the package instead of diffing XML.
  Both packages are parsed into their objects: tasks, containers, event handlers,
  data-flow components and their columns, paths, connection managers, variables,
  parameters, precedence constraints, script task code. Each object is compared
  property by property. GUIDs, DTSIDs, version/build numbers, creation dates and
  designer layout are ignored, so saving a package in Visual Studio without changing
  it reports **no functional changes**. SQL, expressions and C# are shown as text diffs
  inside the object that owns them. The result opens with a plain-language index,
  one line per change: *package › container › step (kind) — what changed*. Cards are
  grouped under their container, and every code change has **Differences**, **Old
  code** and **New code** tabs so you can read either version whole or just the delta.
  The text export has the same shape: summary, then per step OLD CODE / NEW CODE /
  DIFFERENCES.
- **Folder compare**: drop or pick two folders, see which files are added, removed or
  modified, click one to open it side by side. Useful for two project checkouts.
- **Ignore options**: whitespace, case, blank lines. **Presets** for SQL, generic XML
  (pretty-printed one attribute per line) and SSIS.
- **Export**: copy or save a standard unified `.diff`, or save the current view as a
  standalone HTML report. For SSIS the text export is an object-by-object change log.
- Light/dark theme, keyboard shortcuts (Ctrl+Enter, Alt+Up/Down, Esc), settings
  remembered per browser.

## Getting it into the Citrix session

Pick whichever works there:

1. **Copy the file in.** Drop `ValiCode.html` anywhere (desktop, mapped drive) and
   double-click it. It runs from `file://`, nothing executes natively, so AppLocker
   and exe whitelisting do not apply.
2. **Type it in.** If only text can cross the boundary, paste the source into Notepad
   and save as `ValiCode.html`. It is plain UTF-8 text.
3. **Browser blocks local files?** Run `python serve.py` (or paste it into a Jupyter
   cell) and click the printed link. This is the same loopback-server pattern the
   existing notebook uses.

## Files

| File | Purpose |
|---|---|
| `ValiCode.html` | The tool. This is the only file you need. |
| `serve.py` | Optional loopback launcher for environments that block `file://`. |
| `samples/` | Two versions of an SSIS package and a SQL view to try it on. |
| `test/smoke.mjs` | Headless-browser test: diff engine vs brute-force LCS, SSIS object diff on the samples, view rendering. |

## How the SSIS compare matches objects

Objects are keyed by their path, the same shape as SSIS `refId`
(`Package\Load Staging\Source Sales`, `Package.Variables[User::BatchSize]`,
`Package.PrecedenceConstraints[A → B]`). If a path is missing on one side the DTSID
is tried next, so a renamed or moved task shows as *renamed* with its old and new
path rather than as a delete plus an add. Both the SSIS 2012+ attribute format and
the older `<DTS:Property>` child-element format are read.

Properties dropped as noise: `DTSID`, `refId`, `lineageId`, `id`, `VersionBuild`,
`VersionGUID`, `CreationDate`, `CreatorName`, `CreatorComputerName`,
`LastModifiedProductVersion`, `ThreadHint`, `contactInfo`, component `version`,
`DesignTimeProperties` (layout), compiled `BinaryItem` blobs. Everything else is
compared, including column metadata and fast-load options, so a changed mapping or
data type shows up.

## Running the test

```
node test/smoke.mjs
```

Needs Node 18+ and the `playwright` package with Chromium available (it is resolved
from the project or a global install).
