#!/usr/bin/env node
// agile <board.md | dir>: serves the app on localhost with the board's folder beside it, then opens the board.
// Files are re-read on every request; Save (Ctrl/⌘ S) writes an existing .md in that folder back (PUT).
// agile card <board.md> [out-dir]: writes card.json, the board as a dashboard card (out-dir defaults to the file's folder).
// agile badge <board.md> [out-dir]: writes badge.svg. Both follow the badge settings in the board's front matter.
// The card links to the app at AGILE_HOST (default https://aaronp.github.io/agile/) with ?src=AGILE_SRC,
// where AGILE_SRC is where the published board lives (default: the path given, relative to AGILE_HOST).
import { createServer } from 'node:http';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('..', import.meta.url));

/** The board logic, straight from the app page (it only needs a component base class to load). */
async function logic() {
  const html = await readFile(join(app, 'Main.dc.html'), 'utf8');
  const js = html.split('<script type="text/x-dc" data-dc-script')[1].split('>').slice(1).join('>').split('</script>')[0];
  return new Function('DCLogic', `${js}\nreturn { parseBoard, badgeSvg, boardCard, boardLink, AGILE_HOST };`)(class {});
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'card' || cmd === 'badge') {
  const [md, out = dirname(md ?? '')] = args;
  if (!md) { console.error(`Usage: agile ${cmd} <board.md> [out-dir]`); process.exit(1); }
  try {
    const { parseBoard, badgeSvg, boardCard, boardLink, AGILE_HOST } = await logic();
    const board = parseBoard(await readFile(md, 'utf8'));
    const today = new Date().toLocaleDateString('en-CA');
    const card = boardCard(board, today, { label: md, url: boardLink(process.env.AGILE_HOST || AGILE_HOST, process.env.AGILE_SRC || md) });
    const [name, body] = cmd === 'card' ? ['card.json', JSON.stringify(card, null, 2) + '\n'] : ['badge.svg', badgeSvg(board) + '\n'];
    await writeFile(join(out, name), body);
    console.log(`Wrote ${join(out, name)}`);
    process.exit(0);
  } catch (e) {
    console.error(`agile: ${md}: ${e.message}`);
    process.exit(1);
  }
}

if (!cmd || cmd === '-h' || cmd === '--help') {
  console.error('Usage: agile <board.md | dir>   (PORT=8000 to pick the port, NO_OPEN=1 to skip opening a browser)');
  console.error('       agile card <board.md> [out-dir]    (writes card.json)');
  console.error('       agile badge <board.md> [out-dir]   (writes badge.svg)');
  process.exit(cmd ? 0 : 1);
}
const target = resolve(cmd);
const isDir = await stat(target).then((s) => s.isDirectory(), (e) => { console.error(`agile: cannot read ${cmd}: ${e.message}`); process.exit(1); });
const root = isDir ? target : dirname(target);
const APP_FILES = new Set(['/support.js', '/vendor/react.js', '/vendor/react-dom.js']);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.md': 'text/markdown', '.json': 'application/json', '.svg': 'image/svg+xml', '.css': 'text/css' };
/** An existing markdown file inside the served folder: the only thing a PUT may overwrite. */
const writable = (abs) => abs.startsWith(root + sep) && /\.md$/i.test(abs);

// Loopback names a browser may use for this server. Anything else in Host means DNS rebinding, so it is refused.
const hosts = (port) => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
const handler = async (req, res) => {
  if (!hosts(server.address().port).has(req.headers.host)) return res.writeHead(403).end('Forbidden host');
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = p === '/' ? join(app, 'Main.dc.html') : APP_FILES.has(p) ? join(app, p) : resolve(root, '.' + (p.endsWith('/') ? p + 'index.html' : p));
  if (file !== join(app, 'Main.dc.html') && !APP_FILES.has(p) && !file.startsWith(root + sep)) return res.writeHead(404).end('Not found');
  if (req.method === 'PUT') {
    // Cross-site pages cannot get here: a PUT needs a CORS preflight, which this server never answers.
    if (!writable(file) || !(await stat(file).then((s) => s.isFile(), () => false))) return res.writeHead(403).end('Not writable');
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const tmp = `${file}.agile-tmp`;
      await writeFile(tmp, Buffer.concat(chunks));
      await rename(tmp, file); // whole file or nothing, never half-written
      return res.writeHead(204).end();
    } catch (e) {
      return res.writeHead(500).end(e.message);
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end('Method not allowed');
  try {
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    // x-agile-writable tells the app that Save can PUT the board back to this URL.
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', ...(writable(file) ? { 'x-agile-writable': '1' } : {}) }).end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' || e.code === 'EISDIR' ? 404 : 500).end(e.code === 'ENOENT' ? 'Not found' : e.message);
  }
};
const server = createServer(handler);

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const { port } = server.address();
  // Also answer on ::1 so http://localhost:<port> works; skipped if IPv6 loopback is unavailable.
  createServer(handler).on('error', () => {}).listen(port, '::1');
  const url = `http://localhost:${port}/` + (isDir ? '' : `?src=${encodeURIComponent(basename(target))}`);
  console.log(`Serving ${cmd} at ${url}  (Ctrl-C to stop)`);
  if (process.env.NO_OPEN) return;
  const [open, argv] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(open, argv, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
