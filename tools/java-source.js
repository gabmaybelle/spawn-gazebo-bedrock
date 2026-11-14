// Reads the Java edition's repo (gabmaybelle/spawn-gazebo) at the git ref in java-source.json, without
// checking anything out, and loads its gazebo generator (tools/generate-spawn.js with its helpers), so
// both editions build the same gazebo from one design. The repo is ../spawn-gazebo if it is there (or
// the folder given), else a clone in .cache/.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const root = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(root, 'java-source.json'), 'utf8'));

function javaRepo({ dir = null, ref = source.ref } = {}) {
	if (!dir) {
		const sibling = path.resolve(root, '..', 'spawn-gazebo');
		dir = fs.existsSync(path.join(sibling, '.git')) ? sibling : path.join(root, '.cache', 'spawn-gazebo');
	}
	if (!fs.existsSync(path.join(dir, '.git'))) {
		console.log(`cloning ${source.repo} into ${path.relative(root, dir)}`);
		cp.execFileSync('git', ['clone', '--quiet', '--no-checkout', source.repo, dir], { stdio: 'inherit' });
	}
	const git = (a, encoding) => cp.execFileSync('git', ['-C', dir, ...a], { encoding, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
	try { git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], 'utf8'); } catch {
		git(['fetch', '--quiet', '--tags', 'origin'], 'utf8');
	}
	const commit = git(['rev-parse', `${ref}^{commit}`], 'utf8').trim();
	return {
		repo: source.repo,
		ref,
		commit,
		read: (p) => git(['show', `${commit}:${p}`]),
		text: (p) => git(['show', `${commit}:${p}`], 'utf8'),
	};
}

/**
 * The Java generator, loaded from the repo. Its last lines write the .nbt files; here they are swapped
 * for an export, and the gazebo function hands back the block map instead of the file.
 * Returns { gazebo(wood, palette) -> Map("x,y,z" -> { state, nbt }), PALETTES, WOODS }.
 */
function javaGenerator(java) {
	const dir = path.join(root, '.cache', 'java-tools', java.commit.slice(0, 12));
	fs.mkdirSync(dir, { recursive: true });
	for (const f of ['structure.js', 'nbt.js']) fs.writeFileSync(path.join(dir, f), java.text(`tools/${f}`));
	let gen = java.text('tools/generate-spawn.js');
	const tail = gen.lastIndexOf('for (const [palette, p] of Object.entries(PALETTES))');
	if (tail < 0 || !/return g\.toNbt\(\);/.test(gen)) throw new Error("generate-spawn.js has changed shape: the build can't find its write loop or its return");
	gen = gen.slice(0, tail).replace(/return g\.toNbt\(\);/, 'return g;') + '\nmodule.exports = { gazebo, PALETTES, WOODS };\n';
	fs.writeFileSync(path.join(dir, 'generate-spawn.js'), gen);
	const m = require(path.join(dir, 'generate-spawn.js'));
	return { gazebo: (wood, palette) => m.gazebo(wood, m.PALETTES[palette]).blocks, PALETTES: m.PALETTES, WOODS: m.WOODS };
}

const ASSETS = 'common/src/main/resources/assets/spawn_gazebo/';

module.exports = { javaRepo, javaGenerator, ASSETS };
