// Writes Bedrock structure files (.mcstructure): little-endian NBT, uncompressed. In a behaviour
// pack, structures/spawn_gazebo/x.mcstructure loads in game as "spawn_gazebo:x" (the subfolder is
// the namespace).
//
//   mcstructure([sx, sy, sz], blocks)  blocks: [{ x, y, z, name, states, entity }]
//
// Positions with no block are structure void: placing leaves the world there as it is, as the Java
// templates do. A state given as true or false is a byte, a whole number an int, else a string.
'use strict';

// Bedrock's block version for 1.26.0, written into each palette entry; an older world format gets
// upgraded by the game, so this only needs to be no newer than the game.
const BLOCK_VERSION = (1 << 24) | (26 << 16) | (0 << 8) | 0;

const T = { byte: 1, short: 2, int: 3, string: 8, list: 9, compound: 10 };
const tag = (t, v) => ({ t, v });
const byte = (v) => tag('byte', v ? (v === true ? 1 : v) : 0);
const short = (v) => tag('short', v);
const int = (v) => tag('int', v);
const str = (v) => tag('string', v);
const list = (of, items) => tag('list', { of, items });
const compound = (obj) => tag('compound', obj);

function writer() {
	const chunks = [];
	const b = (n, fn) => { const buf = Buffer.alloc(n); fn(buf); chunks.push(buf); };
	const w = {
		u8: (v) => b(1, (x) => x.writeInt8(v)),
		i16: (v) => b(2, (x) => x.writeInt16LE(v)),
		i32: (v) => b(4, (x) => x.writeInt32LE(v)),
		s: (v) => { const d = Buffer.from(v, 'utf8'); w.i16(d.length); chunks.push(d); },
		done: () => Buffer.concat(chunks),
	};
	return w;
}

function payload(w, t) {
	switch (t.t) {
		case 'byte': return w.u8(t.v);
		case 'short': return w.i16(t.v);
		case 'int': return w.i32(t.v);
		case 'string': return w.s(t.v);
		case 'list':
			w.u8(t.v.items.length ? T[t.v.of] : 0); w.i32(t.v.items.length);
			for (const i of t.v.items) payload(w, i);
			return;
		case 'compound':
			for (const [k, v] of Object.entries(t.v)) { w.u8(T[v.t]); w.s(k); payload(w, v); }
			return w.u8(0);
		default: throw new Error('unknown tag ' + t.t);
	}
}

function stateTag(v) {
	if (typeof v === 'boolean') return byte(v ? 1 : 0);
	if (typeof v === 'number') return int(v);
	return str(String(v));
}
const blockTag = (name, states = {}) => compound({
	name: str(name),
	states: compound(Object.fromEntries(Object.entries(states).map(([k, v]) => [k, stateTag(v)]))),
	version: int(BLOCK_VERSION),
});

/** The block entity data Bedrock keeps for the few blocks that need it (see bedrock-map.js). */
function entityTag(e) {
	if (e.kind === 'FlowerPot') return compound({ id: str('FlowerPot'), isMovable: byte(1), PlantBlock: blockTag(e.plant) });
	if (e.kind === 'DecoratedPot') {
		const tags = { id: str('DecoratedPot'), isMovable: byte(1), sherds: list('string', e.sherds.map(str)) };
		if (e.item) tags.item = compound({ Name: str(e.item.id), Count: byte(e.item.count), Damage: short(0), WasPickedUp: byte(0) });
		return compound(tags);
	}
	throw new Error('no block entity writer for ' + e.kind);
}

function mcstructure(size, blocks) {
	const [sx, sy, sz] = size;
	const n = sx * sy * sz;
	const layer = new Array(n).fill(-1);
	const palette = [], index = new Map(), positionData = {};
	for (const bl of blocks) {
		const key = bl.name + JSON.stringify(bl.states || {});
		if (!index.has(key)) { index.set(key, palette.length); palette.push(blockTag(bl.name, bl.states)); }
		// Bedrock's order: x outermost, then y, then z.
		const i = (bl.x * sy + bl.y) * sz + bl.z;
		layer[i] = index.get(key);
		if (bl.entity) positionData[String(i)] = compound({ block_entity_data: entityTag(bl.entity) });
	}
	const root = compound({
		format_version: int(1),
		size: list('int', size.map(int)),
		structure_world_origin: list('int', [int(0), int(0), int(0)]),
		structure: compound({
			block_indices: list('list', [list('int', layer.map(int)), list('int', new Array(n).fill(-1).map(int))]),
			entities: list('compound', []),
			palette: compound({ default: compound({ block_palette: list('compound', palette), block_position_data: compound(positionData) }) }),
		}),
	});
	const w = writer();
	w.u8(T.compound); w.s(''); payload(w, root);
	return w.done();
}

module.exports = { mcstructure, BLOCK_VERSION };
