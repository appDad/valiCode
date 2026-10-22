// Smoke test: loads ValiCode.html in headless Chromium from file://, checks the diff engine
// against a brute-force LCS, runs the SSIS object compare on the samples, and screenshots.
// Run: node test/smoke.mjs
import { createRequire } from 'node:module';
// Resolve playwright from the project, then from any global install (the cloud sandbox has it under /opt/node-tools).
const req = createRequire(import.meta.url);
let chromium;
for (const base of [null, '/opt/node-tools/node_modules/', ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map(p => p + '/')]) {
  try { chromium = (base ? createRequire(base) : req)('playwright').chromium; break; } catch {}
}
if (!chromium) { console.error('playwright not found: npm i -D playwright'); process.exit(2); }
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page_url = 'file://' + path.join(root, 'ValiCode.html');
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.on('pageerror', e => { failures++; console.log('PAGE ERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') { failures++; console.log('CONSOLE ERROR', m.text()); } });
await page.goto(page_url);

// 1. Diff engine vs brute force LCS on random sequences.
const engine = await page.evaluate(() => {
  const { myers } = window.CodeCompare;
  function lcsLen(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    return dp[a.length][b.length];
  }
  let bad = 0, n = 0;
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 400; t++) {
    const la = Math.floor(rnd() * 40), lb = Math.floor(rnd() * 40), alpha = 1 + Math.floor(rnd() * 5);
    const a = Array.from({ length: la }, () => Math.floor(rnd() * alpha));
    const b = Array.from({ length: lb }, () => Math.floor(rnd() * alpha));
    const ops = myers(a, b);
    // validate the edit script reconstructs both sequences in order
    let ia = 0, ib = 0, eq = 0, valid = true;
    for (const op of ops) {
      if (op[0] === '=') { if (op[1] !== ia || op[2] !== ib || a[ia] !== b[ib]) valid = false; ia++; ib++; eq++; }
      else if (op[0] === '-') { if (op[1] !== ia) valid = false; ia++; }
      else { if (op[1] !== ib) valid = false; ib++; }
    }
    if (ia !== la || ib !== lb) valid = false;
    if (!valid || eq !== lcsLen(a, b)) bad++;
    n++;
  }
  // big input timing
  const big1 = Array.from({ length: 20000 }, (_, i) => i % 97), big2 = big1.slice(); for (let i = 0; i < 20000; i += 500) big2[i] = -1;
  const t0 = performance.now(); myers(big1, big2); const ms = performance.now() - t0;
  return { bad, n, ms };
});
check(engine.bad === 0, `myers matches LCS on ${engine.n} random cases (bad=${engine.bad})`);
check(engine.ms < 2000, `20k-line diff in ${engine.ms.toFixed(0)} ms`);

// 2. SQL text compare.
const sql1 = readFileSync(path.join(root, 'samples/vw_PatientSummary_v1.sql'), 'utf8');
const sql2 = readFileSync(path.join(root, 'samples/vw_PatientSummary_v2.sql'), 'utf8');
await page.fill('#txtL', sql1); await page.fill('#txtR', sql2);
await page.selectOption('#preset', 'sql');
await page.click('#btnCompare');
const stats = await page.textContent('#stats');
check(/\+10/.test(stats) && /−2/.test(stats), `SQL view diff stats (canonical layout): ${stats.trim()}`);
check((await page.$$('#result tr.add')).length === 8 && (await page.$$('#result tr.mod')).length === 2, 'SQL view: 8 added rows (incl. 4-line CASE), 2 modified rows');
check(!(await page.isVisible('#ssisFilter')), 'SSIS filter bar hidden in text views');
check((await page.$$('#result tr.eq:not(.hide)')).length === 0, 'changes only: no equal lines visible');
check((await page.$$('#result tr.fold.gap')).length >= 1, 'changes only: gap marker rows present');
await page.click('#result tr.fold.gap');
check((await page.$$('#result tr.eq:not(.hide)')).length > 0, 'clicking a gap reveals the skipped lines');
await page.uncheck('#optOnly');
check((await page.$$('#result tr.eq:not(.hide)')).length > 0 && (await page.$$('#result tr.fold.gap')).length === 0, 'unticking restores context lines');
await page.check('#optOnly');
await page.screenshot({ path: path.join(root, 'test/out-sql.png'), fullPage: true });

// 2b. SQL-aware: same logic, different formatting -> identical. Real change -> reported.
await page.selectOption('#preset', 'auto');
const sqlA = `select [p].[PatientID], p.MRN,\n   isnull(e.AdmitDate,'1900-01-01') as AdmitDate -- default\nfrom [dbo].[Patient] p\n  inner join dbo.Encounter e on e.PatientID=p.PatientID\nwhere e.IsDeleted=0 and e.AdmitDate >= '2020-01-01'`;
const sqlB = `SELECT p.PatientID,\n       p.MRN,\n       ISNULL(e.AdmitDate, '1900-01-01') AS AdmitDate /* default */\nFROM dbo.Patient p\nINNER JOIN dbo.Encounter e ON e.PatientID = p.PatientID\nWHERE e.IsDeleted = 0\n  AND e.AdmitDate >= '2020-01-01'`;
await page.fill('#txtL', sqlA); await page.fill('#txtR', sqlB); await page.fill('#nameL', ''); await page.fill('#nameR', '');
await page.click('#btnCompare');
check((await page.textContent('#detected')).includes('detected: SQL'), 'auto-detect picks SQL from content');
check((await page.textContent('#stats')).includes('Identical'), 'SQL-aware: reformatted/recased/bracketed/commented copy is identical');
await page.fill('#txtR', sqlB.replace("'2020-01-01'", "'2021-01-01'").replace('e.IsDeleted = 0', 'e.IsDeleted = 0\n  AND e.IsTest = 0'));
await page.click('#btnCompare');
const sqlStats = await page.textContent('#stats');
check(/\+2/.test(sqlStats) && /−1/.test(sqlStats), `SQL-aware: real change shows +2/−1 only: ${sqlStats.trim()}`);
await page.uncheck('#sqlLayout'); await page.click('#btnCompare');
check(!(await page.textContent('#stats')).includes('Identical'), 'turning off canonical layout changes the result (option is live)');
await page.check('#sqlLayout');
check((await page.evaluate(() => window.ValiCode.sniff('<?xml version="1.0"?><DTS:Executable xmlns:DTS="www.microsoft.com/SqlServer/Dts"/>'))) === 'ssis', 'sniff: dtsx');
check((await page.evaluate(() => window.ValiCode.sniff('<root><a/></root>'))) === 'xml', 'sniff: xml');
check((await page.evaluate(() => window.ValiCode.sniff('just some notes\nabout things'))) === 'text', 'sniff: text');
check((await page.evaluate(() => window.ValiCode.sniff('x', 'thing.sql'))) === 'sql', 'sniff: .sql extension wins');

// 3. SSIS object compare.
const d1 = readFileSync(path.join(root, 'samples/LoadSales_v1.dtsx'), 'utf8');
const d2 = readFileSync(path.join(root, 'samples/LoadSales_v2.dtsx'), 'utf8');
await page.fill('#txtL', d1); await page.fill('#txtR', d2);
await page.fill('#nameL', 'LoadSales_v1.dtsx'); await page.fill('#nameR', 'LoadSales_v2.dtsx');
await page.click('#btnCompare');
check((await page.textContent('#detected')).includes('SSIS'), 'auto-detect picks SSIS');
check((await page.$eval('#view', v => v.value)) === 'ssis', 'auto-detect switches to the SSIS object view');
const ssis = await page.evaluate(() => window.CodeCompare.state.ssis.map(e => ({ st: e.st, key: e.key, kind: e.obj.kind, changes: e.changes.map(c => c.name) })));
const byKey = Object.fromEntries(ssis.map(e => [e.key, e]));
const expect = (key, st, propsIncluded = []) => {
  const e = byKey[key];
  check(e && e.st === st, `${key}: ${st}` + (e ? '' : ' (missing)') + (e && e.st !== st ? ` got ${e.st} [${e.changes.join(', ')}]` : ''));
  for (const p of propsIncluded) check(e && e.changes.includes(p), `  ${key} change includes "${p}"` + (e ? ` [${e.changes.join(', ')}]` : ''));
};
expect('Package', 'same');
expect('Package\\Truncate Staging', 'same');
expect('Package\\Load Staging\\Source Sales', 'modified', ['SqlCommand']);
expect('Package\\Load Staging\\Derive Flags', 'modified', ['Output[Derived Column Output].col[IsLarge].FriendlyExpression']);
expect('Package\\Load Staging\\Dest Staging', 'modified', ['FastLoadOptions', 'Input[OLE DB Destination Input].col[CustomerID]']);
expect('Package\\Merge to Fact', 'modified', ['SqlStatementSource']);
expect('Package\\Audit Row Counts', 'modified', ['Script: ScriptMain.cs']);
expect('Package\\Notify', 'added');
expect('Package.ConnectionManagers[SMTP]', 'added');
expect('Package.Variables[User::BatchSize]', 'modified', ['Value']);
expect('Package.Variables[User::RunDate]', 'same');
expect('Package.PrecedenceConstraints[Merge to Fact → Audit Row Counts]', 'modified', ['Expression']);
expect('Package.PrecedenceConstraints[Audit Row Counts → Notify]', 'added');
expect('Package.ConnectionManagers[Warehouse]', 'same');
expect('Package\\Load Staging.Paths[OLE DB Source Output]', 'same');
const unexpected = ssis.filter(e => e.st !== 'same').map(e => e.key).filter(k => !['Package\\Load Staging\\Source Sales','Package\\Load Staging\\Derive Flags','Package\\Load Staging\\Dest Staging','Package\\Merge to Fact','Package\\Audit Row Counts','Package\\Notify','Package.ConnectionManagers[SMTP]','Package.Variables[User::BatchSize]','Package.PrecedenceConstraints[Merge to Fact → Audit Row Counts]','Package.PrecedenceConstraints[Audit Row Counts → Notify]'].includes(k));
check(unexpected.length === 0, 'no noise-only objects flagged as changed: ' + JSON.stringify(unexpected));
// Audit script change must NOT include the BinaryItem churn
check(!byKey['Package\\Audit Row Counts'].changes.some(n => /Binary/i.test(n)), 'binary blob churn ignored');
console.log('objects:', ssis.length, 'cards:', (await page.$$('#result .card')).length);
check((await page.$$('#result .card')).length === 10, '10 change cards rendered');
check((await page.$$('#result .card table.diff')).length >= 3, 'mini text diffs rendered for SQL/script changes');
check((await page.$$('#result .outline li')).length === 10, 'change index lists 10 entries');
const idx = await page.textContent('#result .outline');
check(/Load Staging\s*›?\s*Source Sales \(OLE DB Source\) — SQL changed/.test(idx), 'index sentence: Load Staging › Source Sales — SQL changed');
check(/BatchSize \(Variable\) — value: 5000 → 10000/.test(idx), 'index sentence: variable value 5000 → 10000');
check(/Notify \(Send Mail Task\) — new Send Mail Task/.test(idx), 'index sentence: new task');
// Object filter
check(await page.isVisible('#ssisFilter'), 'filter bar visible in SSIS view');
await page.uncheck('#ssisFilter .fcat[value="tasks"]'); await page.uncheck('#ssisFilter .fcat[value="connections"]'); await page.uncheck('#ssisFilter .fcat[value="constraints"]'); await page.uncheck('#ssisFilter .fcat[value="variables"]');
check((await page.$$('#result .card')).length === 3, 'category filter: only the 3 data flow components remain');
check((await page.textContent('#result .summary')).includes('showing 3 of 10'), 'summary shows filtered count');
await page.click('#fAll');
await page.uncheck('#ssisFilter .fst[value="modified"]');
check((await page.$$('#result .card')).length === 3, 'status filter: 3 added objects');
await page.check('#ssisFilter .fst[value="modified"]');
await page.fill('#fText', 'sql changed'); await page.waitForTimeout(300);
check((await page.$$('#result .card')).length === 2, 'text filter "sql changed" leaves the 2 SQL-bearing steps');
await page.fill('#fText', ''); await page.waitForTimeout(300);
check((await page.$$('#result .card')).length === 10, 'clearing filter restores all 10');
check((await page.textContent('#ssisFilter .n[data-n="components"]')) === '(3)', 'category count label');
// Old code / New code tabs
await page.click('#result .codeprop .tabs button[data-m="old"]');
check(await page.isVisible('#result .codeprop pre.old'), 'Old code tab shows full old text');
check(!(await page.isVisible('#result .codeprop .m.diff')), 'diff hidden while Old code tab active');
await page.click('#result .outline li[data-go="5"]');
check((await page.getAttribute('#result .card.cur', 'data-blk')) === '5', 'clicking index entry focuses its card');
await page.screenshot({ path: path.join(root, 'test/out-ssis.png'), fullPage: true });

// SQL inside a task re-cased and re-indented only -> still no functional change
await page.fill('#txtR', d1.replace('SQLTask:SqlStatementSource="TRUNCATE TABLE stg.Sales;"', 'SQLTask:SqlStatementSource="truncate   table [stg].[Sales]  ;"'));
await page.click('#btnCompare');
check(await page.evaluate(() => window.ValiCode.state.ssis.every(e => e.st === 'same')), 'SQL-aware applies inside SSIS tasks (recased SQL is not a change)');
await page.uncheck('#sqlCase'); await page.uncheck('#sqlBrackets'); await page.click('#btnCompare');
check(!(await page.evaluate(() => window.ValiCode.state.ssis.every(e => e.st === 'same'))), 'with SQL options off the recased SQL is reported');
await page.check('#sqlCase'); await page.check('#sqlBrackets');
// identical packages differing only by noise -> no changes
await page.fill('#txtR', d1.replace('DTS:VersionBuild="17"', 'DTS:VersionBuild="99"').replace('TopLeft="138,61"', 'TopLeft="1,1"'));
await page.click('#btnCompare');
const same = await page.evaluate(() => window.CodeCompare.state.ssis.every(e => e.st === 'same'));
check(same, 'save-noise-only difference reports no functional changes');

// text export works in ssis view
await page.fill('#txtR', d2); await page.click('#btnCompare');
const txt = await page.evaluate(() => window.CodeCompare.unifiedText());
check(/LoadSales > Merge to Fact\n   Execute SQL Task - MODIFIED/.test(txt) && txt.includes('OLD CODE:') && txt.includes('NEW CODE:') && txt.includes('+WHEN NOT MATCHED BY SOURCE'), 'text report: package > step, old code, new code, differences');

// raw XML views still work
await page.selectOption('#view', 'side');
check((await page.$$('#result table.diff tr')).length > 50, 'side-by-side normalised XML view renders');
await page.selectOption('#view', 'unified');
check((await page.$$('#result table.diff tr')).length > 50, 'unified view renders');

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
