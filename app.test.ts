// Runs the board's logic (Main.dc.html) with the browser stubbed out.
import { test, expect } from "bun:test";
import { join } from "node:path";

const html = await Bun.file(join(import.meta.dir, "Main.dc.html")).text();
const js = html.split("<script type=\"text/x-dc\" data-dc-script")[1].split(">").slice(1).join(">").split("</script>")[0];
// Like React: state merges, then componentDidUpdate, then the callback.
class DCLogic { state: any; props: any; constructor(p: any) { this.props = p ?? {}; }
  setState(u: any, cb?: () => void) { this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; (this as any).componentDidUpdate?.(); cb?.(); } }

type Store = Record<string, string>;
function load(search = "", store: Store = {}, fetch?: (u: string, init?: any) => Response) {
  const g: any = {
    location: { search, href: "https://x.test/app/" + search, pathname: "/app/", hash: "" },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] },
    history: { entries: [] as string[],
      pushState(_s: any, _t: string, u: string) { this.entries.push(u); this.replaceState(_s, _t, u); },
      replaceState(_s: any, _t: string, u: string) { const [p, h] = u.split("#"); g.location.search = p.includes("?") ? "?" + p.split("?")[1] : ""; g.location.hash = h === undefined ? "" : "#" + h; } },
    fetch: async (u: string, init?: any) => fetch!(u, init),
    document: { querySelector: (sel: string) => g.elements?.[sel.split('=')[0].replace('[', '')] ?? null, getElementById: () => null, createElement: () => ({ click() {}, remove() {} }), body: { appendChild: (a: any) => (g.downloaded = a) } },
    ClipboardItem: class { constructor(public items: Record<string, Promise<Blob>>) {} },
    navigator: {}, confirm: () => g.answer ?? true, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    URL: Object.assign(function (u: string, b?: string) { return new URL(u, b); }, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  };
  g.window = g;
  const names = Object.keys(g);
  const mod = new Function("DCLogic", ...names, js + "\nreturn { Component, parseBoard, serializeBoard, badgeSvg, boardCard, boardAt, deleteTask, moveTask, SEED_MD, THEMES, BASE_VARS, defaultSettings };")(DCLogic, ...names.map(k => g[k]));
  const make = () => { const c = new mod.Component({ startTheme: "minimal" }); c.componentDidMount(); return c; };
  return { ...mod, make, store, g };
}
/** Waits for async work (fetch, deflate) to land: polls until `done()` holds, rather than sleeping a fixed time that a busy machine can overrun. */
async function until(done: () => boolean, what: string) {
  for (const end = Date.now() + 2000; !done(); await Bun.sleep(1)) if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
}
const { Component: C, parseBoard, serializeBoard, deleteTask, moveTask, SEED_MD } = load();
const KEYS = C.KEYS;
const other = SEED_MD.replace("# Sprint 14", "# Elsewhere");

test("the sample and the example parse and round-trip", async () => {
  const example = await Bun.file(join(import.meta.dir, "examples/acme-sprint/board.md")).text();
  for (const md of [SEED_MD, example]) expect(serializeBoard(parseBoard(serializeBoard(parseBoard(md))))).toBe(serializeBoard(parseBoard(md)));
});

test("selections come from the query and are written back to it", () => {
  const q = "?view=split&q=login&tags=feature,bug&owners=Sam&task=t-01&theme=ocean";
  const p = C.fromQuery(q);
  expect(p).toEqual({ src: null, mode: "split", query: "login", tags: ["feature", "bug"], owners: ["Sam"], task: "t-01", theme: "ocean" });
  expect(C.fromQuery("?view=nope&theme=nope")).toEqual({ src: null, mode: "board", query: "", tags: [], owners: [], task: null, theme: null });
  const { make, g } = load(q);
  const c = make();
  expect([c.state.mode, c.state.query, c.state.tagFilter, c.state.ownerFilter, c.state.editingTaskId, c.renderVals().themeId])
    .toEqual(["split", "login", ["feature", "bug"], ["Sam"], "t-01", "ocean"]);
  c.renderVals().modes.find((m: any) => m.label === "Markdown").pick();       // a new view is a history entry
  expect(g.location.search).toBe("?view=markdown&q=login&tags=feature,bug&owners=Sam&task=t-01&theme=ocean");
  expect(g.history.entries.length).toBe(1);
  c.renderVals().onQuery({ target: { value: "" } });                           // a filter change replaces it
  expect(g.history.entries.length).toBe(1);
  expect(g.location.search).not.toContain("q=");
  c.renderVals().themeOptions.find((t: any) => t.name === "Paper").pick();    // picking a style saves it in the board and drops ?theme=
  expect(g.location.search).not.toContain("theme=");
  expect(c.state.board.settings.theme).toBe("paper");
});

test("?src= loads that file (GitHub links raw) without autosaving it", async () => {
  const store: Store = { [KEYS.board]: SEED_MD };
  const { make } = load("?src=https://github.com/o/r/blob/main/board.md", store, u => {
    expect(u).toBe("https://raw.githubusercontent.com/o/r/main/board.md"); return new Response(other); });
  const c = make(); await Bun.sleep(5);
  expect(c.state.board.title).toBe("Elsewhere");
  c.renderVals().onTitle({ target: { value: "Changed" } });
  expect(c.state.board.title).toBe("Changed");
  expect(store[KEYS.board]).toBe(SEED_MD);
  expect(c.state.saveStatus).toMatch(/not saved in this browser/i);
});

test("a ?src= that fails opens the dialog with the error and keeps the saved board", async () => {
  const store: Store = { [KEYS.board]: other };
  const c = load("?src=missing.md", store, () => new Response("nope", { status: 404 })).make(); await Bun.sleep(5);
  expect(c.state.board.title).toBe("Elsewhere");
  expect(c.state.openOpen).toBe(true);
  expect(c.state.openError).toMatch(/missing\.md.*HTTP 404/);
});

test("opening a file replaces the saved board, drops ?src= and is remembered in recents", async () => {
  const store: Store = {};
  const { make, g } = load("?src=a.md", store, () => new Response(SEED_MD));
  const c = make(); await Bun.sleep(5);
  c.openFile(new File([other], "mine.md")); await Bun.sleep(5);
  expect(c.state.board.title).toBe("Elsewhere");
  expect(c.state.openOpen).toBe(false);
  expect(store[KEYS.board]).toContain("# Elsewhere");
  expect(g.location.search).toBe("");
  expect(JSON.parse(store[KEYS.recents])[0]).toEqual({ name: "mine.md", md: other });
  c.openFile(new File(["x"], "pic.png")); expect(c.state.openError).toMatch(/not a markdown file/);
  c.openFile(new File(["# T\nnot a board line"], "bad.md")); await Bun.sleep(5);
  expect(c.state.openError).toMatch(/bad\.md/);
  expect(c.state.board.title).toBe("Elsewhere");
});

test("opening a URL shows it via ?src=; recents reopen it, newest first, without duplicates", async () => {
  const store: Store = {};
  const { make, g } = load("", store, u => new Response(u.endsWith("web.html") ? "<!doctype html><p>hi" : other));
  const c = make();
  c.setState({ openOpen: true, openUrl: "https://x.test/web.html" }); c.submitOpenUrl(); await Bun.sleep(5);
  expect(c.state.openOpen).toBe(true); expect(c.state.openError).toMatch(/not a markdown file/);
  c.setState({ openUrl: "https://x.test/b.md" }); c.submitOpenUrl(); await Bun.sleep(5);
  expect(c.state.board.title).toBe("Elsewhere"); expect(c.state.openOpen).toBe(false);
  expect(g.location.search).toBe("?src=https://x.test/b.md");
  c.openFile(new File([SEED_MD], "s.md")); await Bun.sleep(5);
  c.renderVals().recents.find((r: any) => r.name === "b.md").open(); await Bun.sleep(5);
  expect(c.state.board.title).toBe("Elsewhere");
  expect(JSON.parse(store[KEYS.recents]).map((r: any) => r.name)).toEqual(["b.md", "s.md"]);
  for (let i = 0; i < 12; i++) { c.openFile(new File([SEED_MD], `f${i}.md`)); await Bun.sleep(1); }
  expect(JSON.parse(store[KEYS.recents]).length).toBe(8);
});

test("Download saves the markdown as <title>.md; Save writes to a picked file and reuses it", async () => {
  const { make, g } = load();
  const c = make();
  c.renderVals().download();
  expect(g.downloaded.download).toBe("sprint-14.md");
  c.renderVals().save(); await Bun.sleep(5);                      // no file picker here: Save downloads
  expect(c.state.saveStatus).toMatch(/Downloaded sprint-14\.md/);
  const written: string[] = []; let picks = 0;
  g.showSaveFilePicker = async () => { picks++; return { name: "plan.md", createWritable: async () => ({ write: async (t: string) => written.push(t), close: async () => {} }) }; };
  c.renderVals().save(); await Bun.sleep(5);
  c.renderVals().save(); await Bun.sleep(5);
  expect([picks, written.length, written[0]]).toEqual([1, 2, serializeBoard(c.state.board)]);
  expect(c.state.saveStatus).toMatch(/plan\.md saved/);
});

test("the template's tags are balanced", () => {
  const tpl = html.split("</helmet>")[1].split("</x-dc>")[0];
  for (const tag of ["div", "sc-if", "sc-for", "button", "label", "form", "section", "header", "span"])
    expect([tag, (tpl.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length]).toEqual([tag, (tpl.match(new RegExp(`</${tag}>`, "g")) ?? []).length]);
});

test("the menu holds New, Open, Save, Download, Copy link and Style; New starts a blank board after confirming", async () => {
  const store: Store = { [KEYS.board]: other };
  const { make, g } = load("?view=split&task=t-01", store);
  const c = make();
  const menu = () => c.renderVals().menuItems.map((m: any) => m.label);
  expect(c.renderVals().menuOpen).toBe(false);
  c.renderVals().toggleMenu();
  expect(menu()).toEqual(["New", "Open…", "Save", "Download", "Copy link", "Style"]);
  const pick = (label: string) => c.renderVals().menuItems.find((m: any) => m.label === label).pick();
  pick("Style"); expect([c.state.menuOpen, c.state.pickerOpen]).toEqual([false, true]);
  pick("Open…"); expect([c.state.openOpen, c.state.pickerOpen]).toEqual([true, false]);
  g.answer = false; pick("New");
  expect(c.state.board.title).toBe("Elsewhere");
  g.answer = true; pick("New");
  expect(c.state.board.title).toBe("Untitled board");
  expect(c.state.board.columns.map((col: any) => col.name)).toEqual(["To Do", "Doing", "Done"]);
  expect(c.state.board.columns.flatMap((col: any) => col.tasks)).toEqual([]);
  expect(store[KEYS.board]).toContain("# Untitled board");
  expect(c.state.editingTaskId).toBe(null);
  expect(g.location.search).toBe("?view=split");
});

test("Copy link puts the board in the hash; opening that link shows it without overwriting the saved board", async () => {
  const { make, g } = load("?src=b.md&view=split", {}, () => new Response(other));
  const a = make(); await until(() => a.state.board.title === "Elsewhere", "?src to load");
  let copied = "";
  g.navigator.clipboard = { writeText: async (t: string) => { copied = t; } };
  a.renderVals().menuItems.find((m: any) => m.label === "Copy link").pick(); await until(() => a.state.saveStatus.startsWith("Link"), "the copy");
  expect(a.state.saveStatus).toBe("Link copied");
  const u = new URL(copied);
  expect([u.search, u.hash.startsWith("#board=")]).toEqual(["?view=split", true]);
  const store: Store = { [KEYS.board]: SEED_MD };
  const b = load(u.search, store); b.g.location.hash = u.hash;
  const c = b.make(); await until(() => c.state.board.title !== parseBoard(SEED_MD).title, "the shared board to decode");
  expect(c.state.board.title).toBe("Elsewhere");
  expect(c.persistBoard(c.state.board)).toContain("shared link");
  expect(store[KEYS.board]).toBe(serializeBoard(parseBoard(SEED_MD)));
});

test("the badge: every column by default; settings pick columns, symbols and icons, and are saved in the file", () => {
  const { make, badgeSvg } = load();
  const c = make();
  const counts = c.state.board.columns.map((col: any) => col.tasks.length);
  const rows = () => c.renderVals().badgeRows;
  expect(rows().map((r: any) => [r.column, r.symbol, r.icon, r.included])).toEqual([["Backlog", "B", "📋", true], ["To Do", "T", "⏳", true], ["Doing", "D", "⏳", true], ["Done", "D", "✅", true]]);
  expect(c.renderVals().badgeAlt).toBe(`B: ${counts[0]} 📋 | T: ${counts[1]} ⏳ | D: ${counts[2]} ⏳ | D: ${counts[3]} ✅`);
  rows()[1].toggle();                                                    // leave out To Do
  rows()[2].onSymbol({ target: { value: "P" } });
  rows()[2].onSymbol({ target: { value: "TOOLONG" } });                  // over 6: shown, not saved
  expect([rows()[2].symbol, rows()[2].error]).toEqual(["TOOLONG", "symbol can be at most 6 characters"]);
  rows()[2].onSymbol({ target: { value: "P" } });
  rows()[3].onIcon({ target: { value: "🎉" } });
  expect(rows()[3].icons.map((o: any) => o.label)).toContain("🚀");        // the icon list always offers every icon
  rows()[0].onColor({ target: { value: "#112233" } });
  expect(rows().map((r: any) => r.fill)).toEqual(["#112233", "#3b6fd8", "#b7791f", "#2f855a"]);
  const md = serializeBoard(c.state.board);
  expect(md).toContain('badge: [["Backlog","B","📋","#112233"],["Doing","P","⏳",""],["Done","D","🎉",""]]');
  const svg = badgeSvg(parseBoard(md));
  expect(svg).toContain(`aria-label="B: ${counts[0]} 📋 | P: ${counts[2]} ⏳ | D: ${counts[3]} 🎉"`);
  expect(svg).toStartWith("<svg"); expect(svg).toContain('rx="10"'); expect(svg).toContain('fill="#112233"');
  expect(() => parseBoard(md.replace('"#112233"', '"red"'))).toThrow("color must be like");
  expect(parseBoard(md.replace(',"#112233"]', ']')).settings.badge[0]).toEqual({ column: "Backlog", symbol: "B", icon: "📋", color: "" }); // links made before colors
  expect(() => parseBoard(md.replace('"P"', '"PPPPPPP"'))).toThrow("symbol can be at most 6");
  c.renderVals().resetBadge();
  expect(serializeBoard(c.state.board)).not.toContain("badge:");
});

test("Copy link hands Safari a pending ClipboardItem; a shared board's edits follow into the address bar", async () => {
  const { make, g } = load("", {}, () => new Response(other));
  const a = make();
  let copied = "";
  g.navigator.clipboard = { write: async ([item]: any) => { copied = await (await item.items["text/plain"]).text(); } };
  a.copyLink(); await until(() => a.state.saveStatus.startsWith("Link"), "the copy");
  expect([a.state.saveStatus, copied.includes("#board=")]).toEqual(["Link copied", true]);
  const b = load(""); b.g.location.hash = new URL(copied).hash;
  const c = b.make(); await until(() => c.state.saveStatus !== "Loading shared board…", "the shared board to decode");
  const shared = b.g.location.hash;
  c.commit((x: any) => ({ ...x, title: "Edited" })); await until(() => b.g.location.hash !== shared, "the hash to follow the edit");
  const d = load(""); d.g.location.hash = b.g.location.hash;               // the address bar now opens the edited board
  const e = d.make(); await until(() => e.state.board.title === "Edited", "the edited board to decode");
  expect(e.state.board.title).toBe("Edited");
});

test("Copy link warns when the link is long", async () => {
  const { make, g } = load();
  const c = make();
  g.navigator.clipboard = { writeText: async () => {} };
  c.copyLink(); await until(() => c.state.saveStatus.startsWith("Link"), "the copy");
  expect(c.state.saveStatus).toBe("Link copied");
  c.commit((b: any) => ({ ...b, columns: b.columns.map((col: any, i: number) => i ? col : { ...col, tasks: col.tasks.map((t: any) => ({ ...t, description: Array.from({ length: 40 }, () => crypto.randomUUID()).join(" ") })) }) }));
  c.copyLink(); await until(() => /^Link copied \(/.test(c.state.saveStatus), "the long-link warning");
  expect(c.state.saveStatus).toMatch(/^Link copied \(\d+ characters/);
});

test("inputs on panels (task drawer, style, open dialog) match the panel: light on light, dark on dark", () => {
  const { THEMES, BASE_VARS, defaultSettings } = load();
  const lum = (c: string) => { const m = c.match(/^#([0-9a-f]{6})$/i) ?? []; const rgba = c.match(/rgba?\(([^)]+)\)/);
    const [r, g, b] = m[1] ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : rgba![1].split(",").map(Number);
    return (r * 299 + g * 587 + b * 114) / 1000 > 128; };
  for (const t of THEMES) {
    const v = { ...BASE_VARS, ...t.vars(defaultSettings(t)) };
    const control = v["--panel-control"] === "var(--control)" ? v["--control"] : v["--panel-control"];
    expect([t.id, lum(control)]).toEqual([t.id, lum(v["--panel"])]);
  }
});

test("adding a task opens it with the title focused and selected, so typing replaces it", () => {
  const { make, g } = load();
  const calls: string[] = [];
  g.elements = { "data-kb-title": { focus: () => calls.push("focus"), select: () => calls.push("select") },
    "data-kb-root": { offsetWidth: 1, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1 }), querySelector: () => null } };
  const c = make();
  g.requestAnimationFrame = (f: () => void) => { f(); return 0; };   // after mount, so the effects loop isn't run
  c.renderVals().columns[0].onAddTask();
  expect(c.state.board.columns[0].tasks.at(-1).title).toBe("New task");
  expect(c.state.editingTaskId).toBe(c.state.board.columns[0].tasks.at(-1).id);
  expect(calls).toEqual(["focus", "select"]);
});

test("Enter in the task title closes the drawer, unless the title is invalid", () => {
  const c = load("?task=t-01").make();
  let prevented = 0;
  const key = (k: string) => c.renderVals().editor.onTitleKey({ key: k, preventDefault: () => prevented++ });
  c.renderVals().editor.onTitle({ target: { value: "" } });
  key("Enter");
  expect(c.state.editingTaskId).toBe("t-01");
  c.renderVals().editor.onTitle({ target: { value: "Renamed" } });
  key("a");
  expect(c.state.editingTaskId).toBe("t-01");
  key("Enter");
  expect([c.state.editingTaskId, prevented]).toEqual([null, 2]);
  expect(c.state.board.columns.flatMap((col: any) => col.tasks).find((t: any) => t.id === "t-01").title).toBe("Renamed");
});

test("undo and redo step through board changes; typing in one field is one step", () => {
  const store: Store = {};
  const { make } = load("", store);
  const c = make();
  const v = () => c.renderVals();
  const title = () => c.state.board.title;
  expect([v().canUndo, v().canRedo]).toEqual([false, false]);
  for (const t of ["S", "Sp", "Spr"]) v().onTitle({ target: { value: t } });
  v().onTitleBlur();
  v().addColumn();
  const cols = c.state.board.columns.length;
  v().undo();
  expect([c.state.board.columns.length, title()]).toEqual([cols - 1, "Spr"]);
  v().undo();
  expect(title()).toBe("Sprint 14");
  expect(store[KEYS.board]).toContain("# Sprint 14");
  expect([v().canUndo, v().canRedo]).toEqual([false, true]);
  v().undo();                                                    // nothing left: no change
  expect(title()).toBe("Sprint 14");
  v().redo(); v().redo();
  expect([title(), c.state.board.columns.length, v().canRedo]).toEqual(["Spr", cols, false]);
  v().undo(); v().onTitle({ target: { value: "Other" } });       // a new change drops the redo steps
  expect(v().canRedo).toBe(false);
});

test("Ctrl/⌘ Z and Shift+Z (or Ctrl Y) undo and redo, but leave text fields their own undo", () => {
  const { make, g } = load();
  let onKey: any = null;
  g.addEventListener = (type: string, f: any) => { if (type === "keydown") onKey = f; };
  const c = make();
  c.renderVals().addColumn();
  const n = c.state.board.columns.length;
  const press = (key: string, o: any = {}) => onKey({ key, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false, target: { closest: () => null }, preventDefault() {}, ...o });
  press("z", { target: { closest: () => ({}) } });
  expect(c.state.board.columns.length).toBe(n);
  press("z"); expect(c.state.board.columns.length).toBe(n - 1);
  press("Z", { shiftKey: true }); expect(c.state.board.columns.length).toBe(n);
  press("z"); press("y", { metaKey: false, ctrlKey: true }); expect(c.state.board.columns.length).toBe(n);
});

test("opening a board or starting a new one clears the undo history", async () => {
  const c = load().make();
  c.renderVals().addColumn();
  c.openFile(new File([other], "o.md")); await Bun.sleep(5);
  expect([c.renderVals().canUndo, c.renderVals().canRedo]).toEqual([false, false]);
  c.renderVals().addColumn(); c.newBoard();
  expect(c.renderVals().canUndo).toBe(false);
});

test("child tasks nest under their parent, round-trip as '- parent:', and move up a level when the parent is deleted", () => {
  const { make, g } = load();
  g.elements = { "data-kb-root": { offsetWidth: 1, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1 }), querySelector: () => null } };
  const c = make();
  const col = () => c.state.board.columns[0];
  const parent = col().tasks[0].id;
  c.renderVals().columns[0].onAddTask();                          // a plain task after the parent
  const sibling = c.state.editingTaskId;
  c.renderVals().columns[0].items.find((it: any) => it.id === parent).onAddChild();
  const child = c.state.editingTaskId;
  c.renderVals().editor.onAddChild();                             // grandchild, from the task panel
  const grandchild = c.state.editingTaskId;
  const order = () => col().tasks.map((t: any) => t.id);
  expect(order().indexOf(child)).toBe(order().indexOf(parent) + 1);   // stored right under the parent, ahead of later tasks
  expect(order().indexOf(grandchild)).toBe(order().indexOf(child) + 1);
  expect(order().indexOf(sibling)).toBeGreaterThan(order().indexOf(grandchild));
  const item = (id: string) => c.renderVals().columns[0].items.find((it: any) => it.id === id);
  expect([item(parent).indentStyle, item(child).indentStyle, item(grandchild).indentStyle]).toEqual(["", "margin-left: 18px", "margin-left: 36px"]);
  expect(item(grandchild).rails.map((r: any) => r.cls)).toEqual(["kb-rail kb-rail-end"]);   // child has no later sibling, so no pass-through line
  const lit = () => c.renderVals().columns[0].items.filter((it: any) => it.cardClass.includes("kb-card-ancestor")).map((it: any) => it.id);
  expect(lit()).toEqual([parent, child]);                         // grandchild is open: its whole chain of parents lights up
  c.renderVals().closeEditor();
  expect(lit()).toEqual([]);
  const md = serializeBoard(c.state.board);
  expect(md).toContain(`- id: ${grandchild}\n- parent: ${child}\n`);
  expect(serializeBoard(parseBoard(md))).toBe(md);
  expect(() => parseBoard(md.replace(`- parent: ${child}`, "- parent: nope"))).toThrow('parent "nope"');
  // Moved to another column: a dotted stand-in stays under the parent, and the real card names its parent.
  c.commit((b: any) => moveTask(b, grandchild, c.state.board.columns[1].id, null, "2026-10-28T00:00:00Z"));
  const ids = () => c.renderVals().columns[0].items.map((it: any) => it.id);
  expect(ids().slice(ids().indexOf(parent), ids().indexOf(parent) + 3)).toEqual([parent, child, `away:${grandchild}`]);
  expect(item(`away:${grandchild}`).indentStyle).toBe("margin-left: 36px");
  expect(c.renderVals().columns[1].items.find((it: any) => it.id === grandchild).hasParentHint).toBe(true);
  item(parent).toggleFold();                                      // fold: the parent's children (and their stand-ins) hide
  expect([ids().includes(child), ids().includes(`away:${grandchild}`), item(parent).foldText]).toEqual([false, false, "1"]);
  item(parent).toggleFold();
  expect(ids().includes(child)).toBe(true);
  const after = deleteTask(c.state.board, child);
  expect(after.columns.flatMap((col: any) => col.tasks).find((t: any) => t.id === grandchild).parent).toBe(parent);
});

test("the markdown is stamped with its format version", () => {
  const md = serializeBoard(parseBoard(SEED_MD));
  expect(md.startsWith("---\nversion: 1\n")).toBe(true);
  expect(serializeBoard(parseBoard("# Bare\n"))).toStartWith("---\nversion: 1\n---\n# Bare");
  expect(() => parseBoard("---\nversion: 99\n---\n# Future\n")).toThrow(/newer than this app/);
  expect(() => parseBoard("---\nversion: one\n---\n# Bad\n")).toThrow(/whole number/);
});

test("the card: the badge's columns as the legend, done/total as the number, open tasks in the pill", () => {
  const { boardCard } = load();
  const board = parseBoard(SEED_MD);
  const counts = board.columns.map((c: any) => c.tasks.length);
  const total = counts.reduce((a: number, b: number) => a + b, 0), done = counts[counts.length - 1];
  const c = boardCard(board, "2026-11-18", { label: "board.md" });
  expect(c.heading).toEqual({ primary: `${done}/${total}`, label: "tasks done" });
  expect(c.status).toEqual({ label: `${total - done} open`, tone: "neutral" });
  expect(c.legend.map((l: any) => l.id)).toEqual(board.columns.map((col: any) => col.name));
  expect(Object.values(c.report)).toEqual(counts);
  const first = board.columns[0].name;                                       // only the badge's columns, in its colors
  const picked = { ...board, settings: { ...board.settings, badge: [{ column: first, symbol: "B", icon: "", color: "#112233" }] } };
  expect(boardCard(picked, "2026-11-18", { label: "x" }).legend).toEqual([{ id: first, label: first, color: "#112233" }]);
});

test("Save writes a ?src board back when its server allows it (x-agile-writable), and asks for a file otherwise", async () => {
  const puts: any[] = [];
  const serve = (writable: boolean) => (u: string, init?: any) => {
    if (init?.method === "PUT") { puts.push([u, init.body]); return new Response(null, { status: 204 }); }
    return new Response(other, { headers: writable ? { "x-agile-writable": "1" } : {} });
  };
  const c = load("?src=board.md", {}, serve(true)).make(); await Bun.sleep(5);
  c.renderVals().onTitle({ target: { value: "Changed" } });
  expect(c.renderVals().menuItems.find((m: any) => m.label === "Save").hint).toBe("Writes board.md");
  await c.save();
  expect(puts).toEqual([["https://x.test/app/board.md", serializeBoard(c.state.board)]]);
  expect(c.state.saveStatus).toBe("board.md saved");
  expect(c.renderVals().toast).toBe("board.md saved");                         // and shows as a toast
  const d = load("?src=board.md", {}, serve(false)).make(); await Bun.sleep(5);
  await d.save();                                                             // no picker in the stub: downloads
  expect(puts.length).toBe(1);
  expect(d.state.saveStatus).toMatch(/^Downloaded/);
});

test("the CLI writes card.json and badge.svg from a board", () => {
  const out = require("node:fs").mkdtempSync(join(require("node:os").tmpdir(), "agile-"));
  const run = (cmd: string) => Bun.spawnSync(["node", "bin/agile.mjs", cmd, "examples/acme-sprint/board.md", out], { cwd: import.meta.dir, env: { ...process.env, AGILE_SRC: "https://o.github.io/r/board.md" } });
  expect(run("card").exitCode).toBe(0);
  expect(run("badge").exitCode).toBe(0);
  const card = JSON.parse(require("node:fs").readFileSync(join(out, "card.json"), "utf8"));
  expect(card.title).toBe("Acme · Sprint 14");
  expect(card.source).toEqual({ label: "examples/acme-sprint/board.md", url: "https://aaronp.github.io/agile/?src=https://o.github.io/r/board.md" });
  expect(require("node:fs").readFileSync(join(out, "badge.svg"), "utf8")).toStartWith("<svg");
});

test("the CLI server: the app at /, the board's folder beside it, and PUT back to an existing .md only", async () => {
  const fs = require("node:fs");
  const dir = fs.mkdtempSync(join(require("node:os").tmpdir(), "agile-"));
  fs.copyFileSync(join(import.meta.dir, "examples/acme-sprint/board.md"), join(dir, "board.md"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc = require("node:child_process").spawn("node", [join(import.meta.dir, "bin/agile.mjs"), join(dir, "board.md")], { env: { ...process.env, PORT: String(port), NO_OPEN: "1" } });
  try {
    await new Promise((ok) => proc.stdout.once("data", ok));                  // the "Serving" line
    // node:http rather than fetch, which can be sent through an HTTP proxy
    const at = (path: string, o: { method?: string; body?: string; host?: string } = {}) => new Promise<any>((ok, no) => {
      const r = require("node:http").request({ host: "127.0.0.1", port, path, method: o.method ?? "GET", headers: o.host ? { host: o.host } : {} }, (res: any) => {
        let text = ""; res.on("data", (d: any) => (text += d)); res.on("end", () => ok({ status: res.statusCode, headers: res.headers, text }));
      });
      r.on("error", no); r.end(o.body);
    });
    expect((await at("/")).text).toContain("data-dc-script");
    expect((await at("/vendor/react.js")).status).toBe(200);
    expect((await at("/board.md")).headers["x-agile-writable"]).toBe("1");
    expect((await at("/board.md", { method: "PUT", body: "# Hello\n" })).status).toBe(204);
    expect(fs.readFileSync(join(dir, "board.md"), "utf8")).toBe("# Hello\n");
    expect((await at("/new.md", { method: "PUT", body: "x" })).status).toBe(403);
    expect((await at("/..%2F..%2Fetc%2Fpasswd")).status).toBe(404);
    expect((await at("/board.md", { host: "evil.test" })).status).toBe(403);
  } finally { proc.kill(); }
}, 10000);

test("history: the board replayed to a past time, from the slider, read-only", () => {
  const { boardAt, make } = load();
  const md = `# Past

## To Do

### A
- id: t-01
- owner:
- tags:
- history:
  - To Do @ 2026-01-01T00:00:00Z
  - Doing @ 2026-01-02T00:00:00Z by Sam
  - Archive @ 2026-01-03T00:00:00Z by Sam

### B
- id: t-02
- owner: Kim
- tags:
- history:
  - Old name @ 2026-01-01T12:00:00Z
  - To Do @ 2026-01-02T12:00:00Z by Kim

## Doing
`;
  const parsed = parseBoard(md);                                              // A goes into the archive, as the file would hold it
  const live = { ...parsed, columns: parsed.columns.map((c: any) => ({ ...c, tasks: c.tasks.filter((t: any) => t.id !== "t-01") })), archive: parsed.columns[0].tasks.filter((t: any) => t.id === "t-01") };
  const at = (iso: string) => { const b = boardAt(live, iso); return [b.columns.map((c: any) => [c.name, c.tasks.map((t: any) => `${t.id}:${t.owner}`)]), b.archive.map((t: any) => t.id)]; };
  expect(at("2025-12-31T00:00:00Z")).toEqual([[["To Do", []], ["Doing", []]], []]);
  expect(at("2026-01-01T12:00:00Z")).toEqual([[["To Do", ["t-01:"]], ["Doing", []], ["Old name", ["t-02:"]]], []]);   // a renamed column comes back
  expect(at("2026-01-02T00:00:00Z")).toEqual([[["To Do", []], ["Doing", ["t-01:Sam"]], ["Old name", ["t-02:"]]], []]);
  expect(at("2026-01-03T00:00:00Z")).toEqual([[["To Do", ["t-02:Kim"]], ["Doing", []]], ["t-01"]]);

  const c = make();
  c.setState({ board: live });
  c.renderVals().toggleTime();
  const t = () => c.renderVals().time;
  expect([t().max, t().value, t().label]).toEqual([5, 5, "Now"]);
  t().onChange({ target: { value: "2" } });                                   // the 3rd event: A into Doing
  expect(t().label).toContain("A → Doing (Sam)");
  expect(c.renderVals().rootClass).toContain("kb-past");
  const before = c.state.board;
  expect(c.commit((b: any) => ({ ...b, title: "Changed" }))).toBe(false);    // the past is read-only
  expect(c.state.board).toBe(before);
  expect(c.state.toast).toMatch(/Now to edit/);
  t().now();
  expect(c.state.timeAt).toBe(null);
});
