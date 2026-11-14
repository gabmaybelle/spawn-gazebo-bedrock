// Every gazebo the Java generator makes (each wood, each palette), mapped block by block to Bedrock.
//   templates(generator) -> [{ name, wood, palette, blocks: [{ x, y, z, name, states, entity, chest }], skipped }]
// The structure files, the pack's list of templates and the self-test's expected blocks are all
// written from this.
'use strict';
const { map } = require('./bedrock-map.js');

const SIZE = [15, 15, 15];

function templates(gen) {
	const out = [];
	for (const palette of Object.keys(gen.PALETTES)) {
		for (const wood of gen.WOODS) {
			const blocks = [], skipped = [];
			for (const [key, { state, nbt }] of gen.gazebo(wood, palette)) {
				const [x, y, z] = key.split(',').map(Number);
				const m = map(state);
				if (m.skip) { skipped.push({ x, y, z, state, why: m.why }); continue; }
				const b = { x, y, z, name: m.name, states: m.states };
				if (m.entity) b.entity = m.entity;
				if (nbt && nbt.LootTable) b.chest = true;
				if (m.name === 'minecraft:decorated_pot') {
					// Java keeps the sherds by side and names only the front; Bedrock lists all four
					// (back, left, right, front), a plain side being brick.
					const front = nbt && nbt.sherds && nbt.sherds.front ? nbt.sherds.front.id : 'minecraft:brick';
					b.entity = { kind: 'DecoratedPot', sherds: ['minecraft:brick', 'minecraft:brick', 'minecraft:brick', front] };
					if (nbt && nbt.item) b.entity.item = { id: nbt.item.id, count: nbt.item.count };
				}
				blocks.push(b);
			}
			out.push({ name: `gazebo_${palette}_${wood}`, wood, palette, blocks, skipped });
		}
	}
	return out;
}

module.exports = { templates, SIZE };
