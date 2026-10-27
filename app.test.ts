// Runs the board's logic (Main.dc.html) with the browser stubbed out.
import { test, expect } from "bun:test";
import { join } from "node:path";

const html = await Bun.file(join(import.meta.dir, "Main.dc.html")).text();
const js = html.split("<script type=\"text/x-dc\" data-dc-script")[1].split(">").slice(1).join(">").split("</script>")[0];
// Like React: state merges, then componentDidUpdate, then the callback.
class DCLogic { state: any; props: any; constructor(p: any) { this.props = p ?? {}; }
  setState(u: any, cb?: () => void) { this.state = { ...this.state, ...(typeof u === "function" ? u(this.state) : u) }; (this as any).componentDidUpdate?.(); cb?.(); } }

type Store = Record<string, string>;
function load(search = "", store: Store = {}, fetch?: (u: string) => Response) {
  const g: any = {
    location: { search, href: "https://x.test/app/" + search, pathname: "/app/", hash: "" },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = v), removeItem: (k: string) => delete store[k] },
    history: { entries: [] as string[],
      pushState(_s: any, _t: string, u: string) { this.entries.push(u); g.location.search = u.includes("?") ? "?" + u.split("?")[1] : ""; },
      replaceState(_s: any, _t: string, u: string) { g.location.search = u.includes("?") ? "?" + u.split("?")[1] : ""; } },
    fetch: async (u: string) => fetch!(u),
    document: { querySelector: (sel: string) => g.elements?.[sel.split('=')[0].replace('[', '')] ?? null, getElementById: () => null, createElement: () => ({ click() {}, remove() {} }), body: { appendChild: (a: any) => (g.downloaded = a) } },
    navigator: {}, confirm: () => g.answer ?? true, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    URL: Object.assign(function (u: string, b?: string) { return new URL(u, b); }, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  };
  g.window = g;
  const names = Object.keys(g);
  const mod = new Function("DCLogic", ...names, js + "\nreturn { Component, parseBoard, serializeBoard, SEED_MD, THEMES, BASE_VARS, defaultSettings };")(DCLogic, ...names.map(k => g[k]));
  const make = () => { const c = new mod.Component({ startTheme: "minimal" }); c.componentDidMount(); return c; };
  return { ...mod, make, store, g };
}
const { Component: C, parseBoard, serializeBoard, SEED_MD } = load();
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
  expect(c.state.saveStatus).toMatch(/Saved to plan\.md/);
});

test("the template's tags are balanced", () => {
  const tpl = html.split("</helmet>")[1].split("</x-dc>")[0];
  for (const tag of ["div", "sc-if", "sc-for", "button", "label", "form", "section", "header", "span"])
    expect([tag, (tpl.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length]).toEqual([tag, (tpl.match(new RegExp(`</${tag}>`, "g")) ?? []).length]);
});

test("the menu holds New, Open, Save, Download and Style; New starts a blank board after confirming", async () => {
  const store: Store = { [KEYS.board]: other };
  const { make, g } = load("?view=split&task=t-01", store);
  const c = make();
  const menu = () => c.renderVals().menuItems.map((m: any) => m.label);
  expect(c.renderVals().menuOpen).toBe(false);
  c.renderVals().toggleMenu();
  expect(menu()).toEqual(["New", "Open…", "Save", "Download", "Style"]);
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
