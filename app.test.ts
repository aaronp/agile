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
    document: { querySelector: () => null, getElementById: () => null, createElement: () => ({ click() {}, remove() {} }), body: { appendChild: (a: any) => (g.downloaded = a) } },
    navigator: {}, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, addEventListener() {}, removeEventListener() {},
    URL: Object.assign(function (u: string, b?: string) { return new URL(u, b); }, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  };
  g.window = g;
  const names = Object.keys(g);
  const mod = new Function("DCLogic", ...names, js + "\nreturn { Component, parseBoard, serializeBoard, SEED_MD };")(DCLogic, ...names.map(k => g[k]));
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
