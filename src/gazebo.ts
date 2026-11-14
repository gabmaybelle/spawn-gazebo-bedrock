// The gazebo at the world spawn, built once when a world is first loaded with the pack on: the same
// gazebo as the Java edition (its templates are made from the Java generator by tools/build.js), in
// the wood growing around spawn, in sandstone in deserts and badlands. The ground inside the
// footprint is cleared, anything over a drop gets a foundation, lava near the surface sets to stone,
// and the spawn point moves to the middle, so new players wake up under the spore blossom.
// Mirrors the Java edition's GazeboBuilder (the Paper plugin's): same reaches, same order.
import { world, system, Dimension, Block, BlockVolume, ItemStack, Player, StructureRotation, Vector3 } from "@minecraft/server";
import { TEMPLATES, WOODS, HALF } from "./templates.js";
import { settings, lootTable } from "./settings.js";

/** What was built, kept in a world property so it happens once and protection knows where it is. */
export interface Built {
  x: number; // the middle of the gazebo, at ground level (the ground's top block)
  y: number;
  z: number;
  wood: string;
  palette: string;
  rotation: string;
  chest?: Vector3;
}

const KEY = "spawn_gazebo:built";
/** How far below the ground the gazebo's box reaches, and how far above. */
export const DEPTH = 3, HEIGHT = 15;
const CLEAR_HEIGHT = 18; // blocks cleared above the ground inside the footprint
const FOUNDATION_DEPTH = 12; // how far down a foundation goes under a block over a drop
const CANOPY_REACH = 8; // how far past the footprint a felled tree's canopy can reach
const DECAY_DISTANCE = 7; // a leaf this far from a log, through leaves, has lost its tree
const LAVA_REACH = 16, LAVA_DEPTH = 4, MAX_LAVA = 8192;
const WOOD_REACH = 32, WOOD_STEP = 2, WOOD_DEPTH = 24; // the tree survey round spawn

let cached: Built | null | undefined;
export function built(): Built | null {
  if (cached === undefined) {
    try {
      const raw = world.getDynamicProperty(KEY);
      cached = typeof raw === "string" ? (JSON.parse(raw) as Built) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
}
function remember(b: Built): void {
  world.setDynamicProperty(KEY, JSON.stringify(b));
  cached = b;
}

const log = (s: string) => console.log("[Spawn Gazebo] " + s);
const SIDES: Vector3[] = [
  { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
];
const add = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const key = (v: Vector3) => `${v.x},${v.y},${v.z}`;

/** Plants, snow and the like: what the ground is found under, and what a foundation fills. */
const SOFT = /grass$|short_grass|tall_grass|fern|flower|bush|vine|snow_layer|sapling|mushroom|dandelion|poppy|tulip|orchid|allium|azure|oxeye|cornflower|lily|petals|seagrass|kelp|leaf_litter|cactus_flower|dead_bush/;
const isLog = (id: string) => /_(log|wood)$|^minecraft:(stripped_)?bamboo_block$/.test(id);
const isLeaves = (id: string) => /leaves|azalea_leaves_flowered/.test(id);
const soft = (b: Block) => b.isAir || b.isLiquid || (SOFT.test(b.typeId) && !/grass_block/.test(b.typeId));

/** The ground at x, z: the top block that isn't air, water, leaves, a log or a plant. */
function groundY(dim: Dimension, x: number, z: number): number | undefined {
  const top = dim.getTopmostBlock({ x, z });
  if (!top) return undefined;
  for (let y = top.location.y; y > dim.heightRange.min; y--) {
    const b = dim.getBlock({ x, y, z });
    if (!b) return undefined;
    if (soft(b) || isLeaves(b.typeId) || isLog(b.typeId)) continue;
    return y;
  }
  return undefined;
}

// ------------------------------------------------------------------ the wood and the palette

function biomeId(dim: Dimension, at: Vector3): string {
  try {
    return dim.getBiome(at).id.replace(/^minecraft:/, "");
  } catch {
    return "plains";
  }
}
/** Deserts and badlands (Bedrock calls badlands "mesa"). */
const dry = (biome: string) => /desert|mesa|badlands/.test(biome);

/** The wood a spawn with no trees nearby gets: the tree its biome is known for. */
export function biomeWood(biome: string): string {
  if (/cherry/.test(biome)) return "cherry";
  if (/pale_garden/.test(biome)) return "pale_oak";
  if (/mangrove/.test(biome)) return "mangrove";
  if (/bamboo/.test(biome)) return "bamboo";
  if (/birch/.test(biome)) return "birch";
  if (/roofed|dark_forest/.test(biome)) return "dark_oak";
  if (/taiga|ice_plains|snowy|frozen_peaks|jagged_peaks|grove|cold_beach|redwood/.test(biome)) return "spruce";
  if (/jungle/.test(biome)) return "jungle";
  if (/savanna/.test(biome)) return "acacia";
  if (dry(biome)) return "jungle";
  return "oak";
}

/** "minecraft:stripped_dark_oak_log" is dark_oak; only woods with a template count. */
export function woodOf(id: string): string | undefined {
  const m = /^minecraft:(?:stripped_)?(.+?)_(?:log|wood|block)$/.exec(id);
  if (!m) return undefined;
  const wood = m[1];
  if (/_block$/.test(id) && wood !== "bamboo") return undefined;
  return WOODS.includes(wood) ? wood : undefined;
}

/** The wood of the most common tree within 32 blocks of spawn, or the biome's when there are none. */
function* surveyWood(dim: Dimension, cx: number, cz: number, biome: string, out: { wood: string }): Generator<void, void, void> {
  const counts = new Map<string, number>();
  for (let x = cx - WOOD_REACH; x <= cx + WOOD_REACH; x += WOOD_STEP) {
    for (let z = cz - WOOD_REACH; z <= cz + WOOD_REACH; z += WOOD_STEP) {
      const top = dim.isChunkLoaded({ x, y: 0, z }) ? dim.getTopmostBlock({ x, z }) : undefined;
      if (!top) continue;
      for (let y = top.location.y; y > top.location.y - WOOD_DEPTH && y > dim.heightRange.min; y--) {
        const id = dim.getBlock({ x, y, z })?.typeId;
        const wood = id && isLog(id) ? woodOf(id) : undefined;
        if (wood) counts.set(wood, (counts.get(wood) ?? 0) + 1);
      }
    }
    yield;
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
  out.wood = best ? best[0] : biomeWood(biome);
}

// ------------------------------------------------------------------ clearing and the foundation

/** Trees, plants, snow and overhanging ground above the footprint go. */
function clearAbove(dim: Dimension, cx: number, gy: number, cz: number): void {
  dim.fillBlocks(new BlockVolume({ x: cx - HALF, y: gy + 1, z: cz - HALF }, { x: cx + HALF, y: gy + CLEAR_HEIGHT, z: cz + HALF }), "minecraft:air");
}

/** Whether a leaf still has a log within six leaves of it, counted the way the game does. */
function hasTree(dim: Dimension, leaf: Vector3): boolean {
  const seen = new Set([key(leaf)]);
  let frontier = [leaf];
  for (let step = 1; step < DECAY_DISTANCE && frontier.length; step++) {
    const next: Vector3[] = [];
    for (const at of frontier) {
      for (const s of SIDES) {
        const n = add(at, s);
        if (seen.has(key(n))) continue;
        seen.add(key(n));
        const id = dim.getBlock(n)?.typeId ?? "";
        if (isLog(id)) return true;
        if (isLeaves(id)) next.push(n);
      }
    }
    frontier = next;
  }
  return false;
}

/**
 * The canopies of the trees that stood in the footprint are cut off from their trunks, and would rot
 * away over the next minutes, scattering sticks and saplings. They go now instead, without drops.
 */
function* clearOrphanedCanopy(dim: Dimension, cx: number, gy: number, cz: number): Generator<void, void, void> {
  const reach = HALF + CANOPY_REACH;
  const orphans: Block[] = [];
  for (let x = cx - reach; x <= cx + reach; x++) {
    for (let z = cz - reach; z <= cz + reach; z++) {
      for (let y = gy + 1; y <= gy + CLEAR_HEIGHT + CANOPY_REACH; y++) {
        const b = dim.getBlock({ x, y, z });
        if (!b || !isLeaves(b.typeId) || b.permutation.getState("persistent_bit") === true) continue;
        if (!hasTree(dim, b.location)) orphans.push(b);
      }
    }
    yield;
  }
  for (const b of orphans) b.setType("minecraft:air");
  if (orphans.length) log(`cleared ${orphans.length} leaves left hanging by the trees that stood at spawn`);
}

/** Stone under every block of the ground layer that has air, water or plants beneath it. */
function foundation(dim: Dimension, cx: number, gy: number, cz: number, stone: string): void {
  for (let x = cx - HALF; x <= cx + HALF; x++) {
    for (let z = cz - HALF; z <= cz + HALF; z++) {
      if (dim.getBlock({ x, y: gy, z })?.isAir !== false) continue;
      for (let y = gy - 1; y >= Math.max(gy - FOUNDATION_DEPTH, dim.heightRange.min); y--) {
        const b = dim.getBlock({ x, y, z });
        if (!b || !soft(b)) break;
        b.setType(stone);
      }
    }
  }
}

/**
 * A new player's first steps out of the gazebo shouldn't be into lava. Lava near the surface within
 * 16 blocks sets to stone, with the rest of its pool; lava that was only flowing from it goes.
 */
function* coolLava(dim: Dimension, cx: number, gy: number, cz: number, stone: string): Generator<void, void, void> {
  const poolReach = Math.min(LAVA_REACH * 2, 44);
  const queue: Vector3[] = [];
  const seen = new Set<string>();
  const isLava = (b: Block | undefined) => !!b && /^minecraft:(flowing_)?lava$/.test(b.typeId);
  for (let x = cx - LAVA_REACH; x <= cx + LAVA_REACH; x++) {
    for (let z = cz - LAVA_REACH; z <= cz + LAVA_REACH; z++) {
      const top = (dim.getTopmostBlock({ x, z })?.location.y ?? gy) + 1;
      for (let y = Math.max(Math.min(top, gy) - LAVA_DEPTH, dim.heightRange.min); y <= Math.max(top, gy + 1); y++) {
        const at = { x, y, z };
        if (isLava(dim.getBlock(at)) && !seen.has(key(at))) {
          seen.add(key(at));
          queue.push(at);
        }
      }
    }
    yield;
  }
  let cooled = 0;
  while (queue.length && cooled < MAX_LAVA) {
    const at = queue.shift()!;
    const b = dim.getBlock(at);
    if (!b || !isLava(b)) continue;
    const source = b.typeId === "minecraft:lava" && b.permutation.getState("liquid_depth") === 0;
    b.setType(source ? stone : "minecraft:air");
    cooled++;
    for (const s of SIDES) {
      const n = add(at, s);
      if (Math.abs(n.x - cx) > poolReach || Math.abs(n.z - cz) > poolReach || n.y < Math.max(gy - 2 * LAVA_DEPTH, dim.heightRange.min) || seen.has(key(n))) continue;
      if (isLava(dim.getBlock(n))) {
        seen.add(key(n));
        queue.push(n);
      }
    }
    if (cooled % 256 === 0) yield;
  }
  if (cooled) log(`set ${cooled} blocks of lava near the gazebo to stone`);
}

// ------------------------------------------------------------------ the kit

/** The starter kit: a bed, sixteen torches, six bread, four saplings and a bundle. */
export function kitItems(): ItemStack[] {
  return [
    new ItemStack("minecraft:bed", 1), new ItemStack("minecraft:torch", 16), new ItemStack("minecraft:bread", 6),
    new ItemStack("minecraft:oak_sapling", 4), new ItemStack("minecraft:bundle", 1),
  ];
}

/** Rolls a loot table into a chest; false (with a log line) when the game doesn't know the table. */
function fillFromTable(dim: Dimension, at: Vector3, table: string): boolean {
  try {
    if (!dim.runCommand(`loot insert ${at.x} ${at.y} ${at.z} loot "${table}"`).successCount) throw new Error("nothing inserted");
    return true;
  } catch (e) {
    log(`no loot table "${table}" (${e}), using the starter kit`);
    return false;
  }
}

/** The chest in the railing: found after placing, since the turn moves it. */
function fillChest(dim: Dimension, cx: number, gy: number, cz: number): Vector3 | undefined {
  for (let x = cx - HALF; x <= cx + HALF; x++) {
    for (let z = cz - HALF; z <= cz + HALF; z++) {
      const b = dim.getBlock({ x, y: gy + 3, z });
      if (b?.typeId !== "minecraft:chest") continue;
      const s = settings();
      if (!s.starterChest) {
        // No chest: the railing beside it carries on across its spot.
        const rail = [b.east(), b.west(), b.north(), b.south()].find((n) => n && /_wall$/.test(n.typeId));
        b.setType(rail ? rail.typeId : "minecraft:air");
        return undefined;
      }
      const table = lootTable();
      if (table && fillFromTable(dim, b.location, table)) return b.location;
      const c = b.getComponent("minecraft:inventory")?.container;
      if (c) for (const item of kitItems()) c.addItem(item);
      return b.location;
    }
  }
  log("no starter kit chest found in the gazebo");
  return undefined;
}

// ------------------------------------------------------------------ building

const ROTATIONS = [StructureRotation.None, StructureRotation.Rotate90, StructureRotation.Rotate180, StructureRotation.Rotate270];

/**
 * Builds the gazebo centred on this column and moves the world spawn and the protection to it (an
 * older gazebo stays standing, unprotected). {@code claimed}: the chest is for the players already
 * here, so every newcomer is handed their own kit. Players inside the new gazebo's box are moved
 * onto its floor.
 */
export function* build(dim: Dimension, cx: number, cz: number, claimed: boolean): Generator<void, void, void> {
  const gy = groundY(dim, cx, cz);
  if (gy === undefined) throw new Error(`no ground at ${cx} ${cz}`);
  const biome = biomeId(dim, { x: cx, y: gy, z: cz });
  const palette = dry(biome) ? "sand" : "stone";
  const survey = { wood: "oak" };
  yield* surveyWood(dim, cx, cz, biome, survey);
  const name = `gazebo_${palette}_${survey.wood}`;
  if (!TEMPLATES[name]) throw new Error(`no gazebo template ${name}`);
  const rotation = ROTATIONS[Math.floor(Math.random() * 4)];

  clearAbove(dim, cx, gy, cz);
  yield* clearOrphanedCanopy(dim, cx, gy, cz);
  // A square template turned about itself keeps its footprint, so the corner stays put.
  world.structureManager.place(`spawn_gazebo:${name}`, dim, { x: cx - HALF, y: gy, z: cz - HALF }, { rotation });
  const stone = palette === "sand" ? "minecraft:sandstone" : "minecraft:cobblestone";
  foundation(dim, cx, gy, cz, stone);
  yield* coolLava(dim, cx, gy, cz, palette === "sand" ? "minecraft:sandstone" : "minecraft:stone");
  const chest = fillChest(dim, cx, gy, cz);

  world.setDefaultSpawnLocation({ x: cx, y: gy + 3, z: cz });
  try {
    world.gameRules.spawnRadius = 0;
  } catch {
    dim.runCommand("gamerule spawnradius 0");
  }
  remember({ x: cx, y: gy, z: cz, wood: survey.wood, palette, rotation, chest });
  log(`built the ${palette} gazebo in ${survey.wood} at ${cx} ${gy} ${cz} (${biome}, turned ${rotation})`);
  const here = world.getAllPlayers();
  // The chest is for whoever is here now; a world with nobody in it yet keeps it for its first player.
  setClaimed(claimed || here.length > 0);
  for (const p of here) p.setDynamicProperty(JOINED, true);
  // On a new world, whoever is in it (the one who made it) moves in; with the command, whoever the
  // gazebo was built on (in its plinth, say).
  for (const p of dim.getPlayers()) {
    const l = p.location;
    const inBox = Math.abs(l.x - (cx + 0.5)) <= HALF + 1 && Math.abs(l.z - (cz + 0.5)) <= HALF + 1 && l.y >= gy - DEPTH && l.y <= gy + HEIGHT;
    if (!claimed || inBox) p.teleport({ x: cx + 0.5, y: gy + 3, z: cz + 0.5 }, { dimension: dim });
  }
}

// ------------------------------------------------------------------ later players' kit

const JOINED = "spawn_gazebo:joined"; // a player property: this player has been here since the gazebo
const CLAIMED = "spawn_gazebo:claimed"; // a world property: the chest's kit has been taken
const setClaimed = (v: boolean) => world.setDynamicProperty(CLAIMED, v);

/**
 * A player's first join after the gazebo is built: the first player gets the chest; everyone after
 * them is handed their own kit, the same items.
 */
export function welcome(player: Player): void {
  const b = built();
  if (!b || !b.wood || player.getDynamicProperty(JOINED)) return;
  player.setDynamicProperty(JOINED, true);
  if (!b.chest) return;
  if (!world.getDynamicProperty(CLAIMED)) {
    setClaimed(true);
    return;
  }
  // A roll of the chest's loot table, or the starter kit: into their inventory, whatever doesn't fit
  // dropping at their feet.
  const table = lootTable();
  if (table) {
    try {
      if (!player.runCommand(`loot give @s loot "${table}"`).successCount) throw new Error("nothing given");
      log(`handed ${player.name} a roll of ${table}`);
      return;
    } catch (e) {
      log(`no loot table "${table}" (${e}), handing the starter kit`);
    }
  }
  const inv = player.getComponent("minecraft:inventory")?.container;
  for (const item of kitItems()) {
    const left = inv ? inv.addItem(item) : item;
    if (left) player.dimension.spawnItem(left, player.location);
  }
  log(`handed ${player.name} their own starter kit`);
}

/**
 * Waits for the spawn area to load (the gazebo's box and the tree survey round it), then builds.
 * After a minute it builds with whatever of the survey area has loaded.
 */
export function buildWhenReady(): void {
  if (built()) return;
  let tries = 0, running = false;
  const timer = system.runInterval(() => {
    if (built() || running) {
      if (built()) system.clearRun(timer);
      return;
    }
    tries++;
    const dim = world.getDimension("minecraft:overworld");
    const sp = world.getDefaultSpawnLocation();
    const near = HALF + CANOPY_REACH + 1, far = WOOD_REACH;
    const loaded = (r: number) => [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]].every(([dx, dz]) => dim.isChunkLoaded({ x: sp.x + dx, y: 0, z: sp.z + dz }));
    if (!loaded(near) || (!loaded(far) && tries < 60)) {
      if (tries === 1) log(`waiting for the spawn area at ${sp.x} ${sp.z} to load`);
      return;
    }
    running = true;
    const job = build(dim, sp.x, sp.z, false);
    system.runJob((function* () {
      try {
        yield* job;
      } catch (e) {
        log("couldn't build the gazebo: " + e);
        // Remembered anyway, so a world without a place to build doesn't try every second forever.
        remember({ x: sp.x, y: sp.y, z: sp.z, wood: "", palette: "", rotation: "none" });
      }
      running = false;
    })());
  }, 20);
}
