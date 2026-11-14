// Maps a Java block state string ("minecraft:oak_stairs[facing=east,half=top,...]") to Bedrock's
// name and states ({ name, states }), or { skip, why } for what can't be placed as a plain block.
// Every result is checked on a real Bedrock server by the pack's "states" and "build" tests: a
// wrong name or state makes BlockPermutation.resolve throw, and the test names it.
'use strict';

function parse(s) {
	const m = /^([^\[]+)(?:\[(.*)\])?$/.exec(s);
	const props = {};
	if (m[2]) for (const kv of m[2].split(',')) { const [k, v] = kv.split('='); props[k] = v; }
	return { name: m[1], props };
}

// Bedrock's numbers for a horizontal facing.
const WEIRDO = { east: 0, west: 1, south: 2, north: 3 }; // stairs
const POT_DIR = { south: 0, west: 1, north: 2, east: 3 }; // decorated pot "direction"
const VINE_BITS = { south: 1, west: 2, north: 4, east: 8 };

// Java's potted plant names to the plant's Bedrock block.
const POTTED = { azalea_bush: 'azalea', flowering_azalea_bush: 'flowering_azalea' };

// Java names that differ on Bedrock.
const RENAME = {
	'minecraft:iron_chain': 'minecraft:iron_chain', // Java 26.x renamed chain; Bedrock checked by the test
	'minecraft:dirt_path': 'minecraft:grass_path',
	'minecraft:dead_bush': 'minecraft:deadbush',
	'minecraft:cave_vines': 'minecraft:cave_vines_head_with_berries',
	'minecraft:flowering_azalea_leaves': 'minecraft:azalea_leaves_flowered',
};

function map(javaState) {
	const { name, props } = parse(javaState);
	const id = name.replace(/^minecraft:/, '');
	const states = {};
	let out = RENAME[name] || name;

	// A potted plant is a plain flower pot on Bedrock, with the plant kept in the pot's block entity.
	if (/^potted_/.test(id)) {
		const plant = id.slice('potted_'.length);
		return { name: 'minecraft:flower_pot', states: { update_bit: false }, entity: { kind: 'FlowerPot', plant: 'minecraft:' + (POTTED[plant] || plant) } };
	}

	if (/_stairs$/.test(id)) {
		states['weirdo_direction'] = WEIRDO[props.facing];
		states['upside_down_bit'] = props.half === 'top';
	} else if (/_slab$/.test(id)) {
		states['minecraft:vertical_half'] = props.type === 'top' ? 'top' : 'bottom';
	} else if (/_wall$/.test(id)) {
		states['wall_post_bit'] = props.up === 'true';
	} else if (id === 'lantern') {
		states['hanging'] = props.hanging === 'true';
	} else if (id === 'iron_chain' || /_log$/.test(id) || /stripped_bamboo_block$/.test(id)) {
		states['pillar_axis'] = props.axis;
	} else if (id === 'lightning_rod') {
		states['facing_direction'] = 1; // up
	} else if (/azalea_leaves$/.test(id)) {
		states['persistent_bit'] = true;
		states['update_bit'] = false;
	} else if (id === 'cave_vines') {
		states['growing_plant_age'] = 25;
	} else if (id === 'chest') {
		states['minecraft:cardinal_direction'] = props.facing;
	} else if (id === 'decorated_pot') {
		states['direction'] = POT_DIR[props.facing];
	} else if (id === 'pink_petals') {
		states['growth'] = Number(props.flower_amount) - 1;
		states['minecraft:cardinal_direction'] = props.facing;
	} else if (id === 'vine') {
		let bits = 0;
		for (const d of Object.keys(VINE_BITS)) if (props[d] === 'true') bits |= VINE_BITS[d];
		states['vine_direction_bits'] = bits;
	}
	return { name: out, states };
}

module.exports = { map, parse };
