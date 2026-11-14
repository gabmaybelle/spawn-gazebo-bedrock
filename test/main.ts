// Spawn Gazebo self-test: a test-only pack for a throwaway test world, never shipped. Stable script
// APIs only, so it runs on a plain dedicated server with no experiments and no player.
//
//   /scriptevent spawn_gazebo:test [palette wood]   every case, then "SG TEST: DONE"; with a
//                                                   palette and wood, the build must have picked them
//
// Each case prints "SG TEST: CASE <name>: PASS" or "... FAIL (why)"; tools/bds-check.js reads them.
// The pack is asked what it built through spawn_gazebo:debug, since one pack can't read another's.
import { world, system, BlockPermutation, Vector3 } from "@minecraft/server";
import { EXPECTED, STATES } from "./expected.js";

const HALF = 7, SIZE = 15;
const log = (s: string) => console.warn("SG TEST: " + s);
const wait = (ticks: number) => new Promise<void>((r) => system.runTimeout(() => r(), ticks));
const overworld = () => world.getDimension("minecraft:overworld");

interface Built { x: number; y: number; z: number; wood: string; palette: string; rotation: string; chest?: Vector3 }
type Reply = { built: Built | null; spawn: Vector3; refused?: boolean; inside?: boolean };
let reply: ((r: Reply) => void) | undefined;
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "spawn_gazebo:debug_reply") {
    const f = reply;
    reply = undefined;
    f?.(JSON.parse(ev.message));
  }
  if (ev.id === "spawn_gazebo:test") void run(ev.message.trim().split(/\s+/).filter(Boolean));
});
const ask = (what = "spawn_gazebo:debug") => new Promise<Reply>((resolve) => {
  reply = resolve;
  overworld().runCommand("scriptevent " + what);
});

// The four ways a square template can land when turned about itself.
const TURNS: ((x: number, z: number) => [number, number])[] = [
  (x, z) => [x, z], (x, z) => [SIZE - 1 - z, x], (x, z) => [SIZE - 1 - x, SIZE - 1 - z], (x, z) => [z, SIZE - 1 - x],
];

/** The built gazebo against its template: the best of the four turns, block names compared. */
function compare(b: Built) {
  const want = EXPECTED[`gazebo_${b.palette}_${b.wood}`];
  const dim = overworld();
  let best = { ok: -1, wrong: [] as string[], turn: 0 };
  TURNS.forEach((turn, i) => {
    let ok = 0;
    const wrong: string[] = [];
    for (const [x, y, z, name] of want) {
      const [tx, tz] = turn(x, z);
      const got = dim.getBlock({ x: b.x - HALF + tx, y: b.y + y, z: b.z - HALF + tz })?.typeId;
      if (got === name) ok++;
      else wrong.push(`${name}@${x},${y},${z} is ${got}`);
    }
    if (ok > best.ok) best = { ok, wrong, turn: i };
  });
  return { ...best, total: want.length };
}

async function run(args: string[]) {
  log("start");
  const results: boolean[] = [];
  const pass = (name: string, ok: boolean, detail = "") => {
    results.push(ok);
    log(`CASE ${name}: ${ok ? "PASS" : "FAIL"}${detail ? " (" + detail + ")" : ""}`);
  };
  try {
    // Every block and state any template uses is one this game knows.
    const unknown: string[] = [];
    for (const [n, s] of STATES) {
      try {
        BlockPermutation.resolve(n, s as Record<string, string | number | boolean>);
      } catch {
        unknown.push(`${n} ${JSON.stringify(s)}`);
      }
    }
    pass("states", unknown.length === 0, `${STATES.length - unknown.length} of ${STATES.length} known` + (unknown.length ? "; unknown: " + unknown.slice(0, 8).join("; ") : ""));

    const { built: b, spawn } = await ask();
    if (!b || !b.wood) {
      pass("built", false, "nothing built");
      return;
    }
    pass("built", true, `${b.palette} ${b.wood} at ${b.x} ${b.y} ${b.z}, turned ${b.rotation}`);
    if (args.length >= 2) pass("choice", b.palette === args[0] && b.wood === args[1], `wanted ${args[0]} ${args[1]}, got ${b.palette} ${b.wood}`);
    pass("spawn", spawn.x === b.x && spawn.z === b.z && spawn.y === b.y + 3, `spawn ${spawn.x} ${spawn.y} ${spawn.z}`);
    const before = compare(b);
    pass("blocks", before.ok === before.total, `${before.ok} of ${before.total} match, turn ${before.turn}` + (before.wrong.length ? "; " + before.wrong.slice(0, 5).join("; ") : ""));

    const dim = overworld();
    const items: string[] = [];
    const c = b.chest && dim.getBlock(b.chest)?.getComponent("minecraft:inventory")?.container;
    if (c) for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) items.push(`${it.amount} ${it.typeId.replace("minecraft:", "")}`);
    }
    pass("chest", items.length === 5, items.join(", ") || "no chest");

    // Nothing hanging with no tree, no lava within reach of the surface.
    let lava = 0;
    for (let x = b.x - 16; x <= b.x + 16; x++) for (let z = b.z - 16; z <= b.z + 16; z++) for (let y = Math.max(b.y - 4, dim.heightRange.min); y <= b.y + 4; y++) {
      if (/lava/.test(dim.getBlock({ x, y, z })?.typeId ?? "")) lava++;
    }
    pass("lava", lava === 0, `${lava} lava blocks within 16`);

    // Blasts: TNT on the lawn by the steps and a creeper beside the plinth (inside the radius), and
    // TNT 20 blocks out, which should still dig its crater.
    // The ground 20 blocks out, which can be higher or lower than the gazebo's.
    const far = dim.getTopmostBlock({ x: b.x + 20, z: b.z })?.location ?? { x: b.x + 20, y: b.y, z: b.z };
    const farBefore = dim.getBlock(far)?.typeId;
    dim.spawnEntity("minecraft:tnt", { x: b.x + 0.5, y: b.y + 1, z: b.z + 9.5 });
    const creeper = dim.spawnEntity("minecraft:creeper", { x: b.x + 9.5, y: b.y + 1, z: b.z + 0.5 });
    dim.spawnEntity("minecraft:tnt", { x: far.x + 0.5, y: far.y + 1, z: far.z + 0.5 });
    await wait(5);
    creeper.triggerEvent("minecraft:start_exploding_forced");
    await wait(115);
    const after = compare(b);
    pass("blasts inside", after.ok === before.ok, `${after.ok} of ${before.ok} still match`);
    pass("blast outside", dim.getBlock(far)?.typeId !== farBefore, `the block 20 out was ${farBefore}, is ${dim.getBlock(far)?.typeId}`);

    // The build command's steps: refused on top of the gazebo, built 40 blocks away, where the
    // spawn and the protection then move.
    const on = await ask(`spawn_gazebo:debug_build ${b.x + 3} ${b.z}`);
    pass("command refuses on a gazebo", on.refused === true && on.built?.x === b.x, on.refused ? "refused" : "built anyway");
    const away = await ask(`spawn_gazebo:debug_build ${b.x - 40} ${b.z}`);
    const nb = away.built!;
    pass("command builds", away.refused === false && nb.x === b.x - 40 && away.spawn.x === nb.x && away.spawn.y === nb.y + 3, `${nb.palette} ${nb.wood} at ${nb.x} ${nb.y} ${nb.z}, spawn ${away.spawn.x} ${away.spawn.y} ${away.spawn.z}`);
    const second = compare(nb);
    pass("command blocks", second.ok === second.total, `${second.ok} of ${second.total} match` + (second.wrong.length ? "; " + second.wrong.slice(0, 5).join("; ") : ""));
    const c2 = nb.chest && dim.getBlock(nb.chest)?.getComponent("minecraft:inventory")?.container;
    pass("command chest", !!c2 && c2.emptySlotsCount === c2.size - 5, c2 ? `${c2.size - c2.emptySlotsCount} stacks` : "no chest");

    // The settings, saved as the form saves them.
    const setTo = (s: object) => ask(`spawn_gazebo:debug_settings ${JSON.stringify(s)}`);
    const isInside = async (x: number) => (await ask(`spawn_gazebo:debug_inside ${x} ${nb.y} ${nb.z}`)).inside;
    await setTo({ protectedRadius: 20 });
    const in20 = await isInside(nb.x + 20), out21 = await isInside(nb.x + 21);
    pass("settings radius", in20 === true && out21 === false, `20 out ${in20 ? "in" : "out"}, 21 out ${out21 ? "in" : "out"}`);
    await setTo({ protectGazebo: false });
    const off = await isInside(nb.x);
    pass("settings protection off", off === false, `the middle is ${off ? "still" : "no longer"} protected`);
    await setTo({ protectGazebo: true, protectedRadius: 12 });

    await setTo({ chestLoot: "bonus_chest" });
    const bonus = (await ask(`spawn_gazebo:debug_build ${b.x} ${b.z + 40}`)).built!;
    const bc = bonus.chest && dim.getBlock(bonus.chest)?.getComponent("minecraft:inventory")?.container;
    const loot: string[] = [];
    if (bc) for (let i = 0; i < bc.size; i++) { const it = bc.getItem(i); if (it) loot.push(it.typeId.replace("minecraft:", "")); }
    pass("settings bonus chest", loot.length > 0 && !loot.includes("bundle"), loot.join(", ") || "empty");

    await setTo({ starterChest: false, chestLoot: "starter_kit" });
    const bare = (await ask(`spawn_gazebo:debug_build ${b.x + 40} ${b.z + 40}`)).built!;
    let chests = 0;
    for (let x = bare.x - HALF; x <= bare.x + HALF; x++) for (let z = bare.z - HALF; z <= bare.z + HALF; z++) {
      if (dim.getBlock({ x, y: bare.y + 3, z })?.typeId === "minecraft:chest") chests++;
    }
    pass("settings no chest", !bare.chest && chests === 0, `${chests} chests in the gazebo`);
    await setTo({ starterChest: true });
  } catch (e) {
    pass("run", false, String(e));
  } finally {
    const failed = results.filter((r) => !r).length;
    log(failed ? `${failed} of ${results.length} FAILED` : `PASS all (${results.length} cases)`);
    log("DONE");
  }
}

log("test pack started");
