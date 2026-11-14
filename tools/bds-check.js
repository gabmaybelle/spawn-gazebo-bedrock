#!/usr/bin/env node
// Headless check on Bedrock Dedicated Server: puts the built pack and the self-test pack on a fresh
// world, starts the server with no window, keeps the chunks round the spawn ticking, waits for the
// gazebo to be built, runs the self-test (/scriptevent spawn_gazebo:test), stops the server and
// reads its log and content log. It can't see the gazebo (a game client is needed for that).
//
//   node tools/bds-check.js <server folder> [--zip <bedrock-server-x.y.z.zip>] [--type FLAT|DEFAULT]
//        [--seed <n>] [--expect "<palette> <wood>"] [--seconds 300] [--port 19240]
//
// Run `npm run build` first. Downloading and running the server means you accept Minecraft's EULA.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) { console.error('usage: node tools/bds-check.js <server folder> [--type DEFAULT] [--seed N] [--expect "stone oak"]'); process.exit(2); }
const folder = path.resolve(args[0]);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const zip = opt('--zip', null), type = opt('--type', 'FLAT'), seed = opt('--seed', ''), expect = opt('--expect', '');
const seconds = parseInt(opt('--seconds', '300'), 10), port = parseInt(opt('--port', '19240'), 10);
const packs = path.join(root, 'build', 'packs');
if (!fs.existsSync(path.join(packs, 'bp', 'manifest.json'))) { console.error('no build: run npm run build first'); process.exit(2); }

const exe = path.join(folder, process.platform === 'win32' ? 'bedrock_server.exe' : 'bedrock_server');
if (!fs.existsSync(exe)) {
	if (!zip) { console.error('no server in the folder and no --zip given'); process.exit(2); }
	fs.mkdirSync(folder, { recursive: true });
	console.log('extracting', zip);
	if (process.platform === 'win32') cp.execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${folder}' -Force`], { stdio: 'inherit' });
	else cp.execFileSync('unzip', ['-q', '-o', zip, '-d', folder], { stdio: 'inherit' });
}

const copyDir = (src, dst) => { fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); };
copyDir(path.join(packs, 'bp'), path.join(folder, 'development_behavior_packs', 'SpawnGazeboBP'));
copyDir(path.join(packs, 'bp-test'), path.join(folder, 'development_behavior_packs', 'SpawnGazeboTestBP'));
const header = (p) => JSON.parse(fs.readFileSync(path.join(packs, p, 'manifest.json'), 'utf8')).header;

const level = 'sgcheck';
const world = path.join(folder, 'worlds', level);
fs.rmSync(world, { recursive: true, force: true });
fs.mkdirSync(world, { recursive: true });
const ref = (h) => ({ pack_id: h.uuid, version: h.version });
fs.writeFileSync(path.join(world, 'world_behavior_packs.json'), JSON.stringify([ref(header('bp')), ref(header('bp-test'))], null, 2));

const propsPath = path.join(folder, 'server.properties');
let props = fs.readFileSync(propsPath, 'utf8');
const set = (k, v) => { const re = new RegExp(`^${k}=.*$`, 'm'); props = re.test(props) ? props.replace(re, `${k}=${v}`) : props + `\n${k}=${v}`; };
set('server-port', port); set('server-portv6', port + 1); set('level-name', level); set('level-type', type); set('level-seed', seed);
set('gamemode', 'survival'); set('allow-cheats', 'true'); set('content-log-file-enabled', 'true');
set('content-log-console-output-enabled', 'true'); set('online-mode', 'false'); set('allow-list', 'false');
set('max-players', '2'); set('server-name', 'Spawn Gazebo check'); set('enable-lan-visibility', 'false');
fs.writeFileSync(propsPath, props);

console.log(`starting the server on port ${port} (${type}${seed ? ', seed ' + seed : ''}), up to ${seconds} s`);
const log = [];
// On Linux the server loads its own libraries from its folder, and the zip doesn't keep it executable.
if (process.platform !== 'win32') fs.chmodSync(exe, 0o755);
const env = { ...process.env, LD_LIBRARY_PATH: folder };
const child = cp.spawn(exe, [], { cwd: folder, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let started = false, spawnArea = false, built = false, done = false, stopped = false;
const send = (cmd) => { console.log('> ' + cmd); child.stdin.write(cmd + '\n'); };
const stop = () => { if (stopped) return; stopped = true; try { send('stop'); } catch {} setTimeout(() => { try { child.kill(); } catch {} }, 15000); };
const onData = (d) => {
	const s = d.toString();
	log.push(s);
	process.stdout.write(s);
	const all = log.join('');
	if (!started && /Server started/.test(all)) {
		started = true;
		// Keep the spawn area (the gazebo, its lawn, the tree survey and the far TNT) loaded with no
		// player on: a ticking area round the world spawn, wherever the server put it.
		setTimeout(() => send('tickingarea add circle ~ ~ ~ 4 sgtest'), 1500);
	}
	// The world spawn can be far from the middle of the world: keep it loaded too, wherever it is.
	const w = /\[Spawn Gazebo\] waiting for the spawn area at (-?\d+) (-?\d+)/.exec(all);
	if (started && w && !spawnArea) { spawnArea = true; setTimeout(() => send(`tickingarea add circle ${w[1]} 0 ${w[2]} 4 sgspawn`), 2000); }
	if (started && !built && /\[Spawn Gazebo\] (built the|couldn't build)/.test(all)) {
		built = true;
		setTimeout(() => send(('scriptevent spawn_gazebo:test ' + expect).trim()), 3000);
	}
	if (!done && /SG TEST: DONE/.test(all)) { done = true; setTimeout(stop, 2000); }
};
child.stdout.on('data', onData); child.stderr.on('data', onData);
const limit = setTimeout(stop, seconds * 1000);
child.on('exit', (code) => {
	clearTimeout(limit);
	const all = log.join('');
	let contentLog = '';
	const m = /Writing log to: (.+ContentLog[^\r\n]+\.txt)/.exec(all);
	if (m && fs.existsSync(m[1].trim())) contentLog = fs.readFileSync(m[1].trim(), 'utf8');
	const both = all + '\n' + contentLog;
	const lines = both.split(/\r?\n/);
	const problems = [];
	const errLines = lines.filter((l) => (/ (ERROR|WARN)\] /.test(l) || /\]\[(error|warning)\]/i.test(l) || /exception/i.test(l))
		&& !/SG TEST|errorMessage=\(null\)|Content logging to console/.test(l));
	if (!/Server started/.test(all)) problems.push('the server never said "Server started"');
	if (!/\[Spawn Gazebo\] [\d.]+: script loaded/.test(both)) problems.push("the pack's script never said it loaded");
	const sg = [...new Set(lines.filter((l) => /\[Spawn Gazebo\]/.test(l)).map((l) => l.replace(/^.*\[Spawn Gazebo\] /, '')))];
	console.log('\npack lines:\n  ' + (sg.join('\n  ') || '(none)'));
	const cases = lines.filter((l) => /SG TEST: CASE /.test(l)).map((l) => l.replace(/^.*SG TEST: /, ''));
	console.log('\ncases:\n  ' + (cases.join('\n  ') || '(none)'));
	const fails = lines.filter((l) => /SG TEST: (CASE .*: )?FAIL|SG TEST: \d+ of \d+ FAILED/.test(l));
	if (fails.length) problems.push('the self-test failed (above)');
	else if (!/SG TEST: PASS all/.test(both)) problems.push('the self-test never passed' + (done ? '' : ' (no DONE line: it timed out)'));
	if (errLines.length) problems.push(`${errLines.length} error or warning line(s):\n  ` + [...new Set(errLines)].slice(0, 20).join('\n  '));
	const version = (/Version:? ([\d.]+)/.exec(all) || [])[1] || '?';
	console.log('\n=== result ===');
	console.log(`server ${version}, exit code ${code}`);
	if (problems.length) { console.log('FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
	console.log(`ok: ${cases.length} cases passed, no error or warning lines`);
});
