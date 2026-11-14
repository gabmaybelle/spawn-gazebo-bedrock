// Keeps the gazebo as it was built: survival players can't break or build within the protected
// radius of its middle (12 blocks unless the settings say otherwise), and explosions leave everything there alone. Creative players can change it.
// Placing has no cancelable event in the stable API, but it starts as using an item on a block,
// which can be cancelled; the chest and the pots still open, as only a held block (or a bucket,
// flint and steel, a fire charge or bone meal) is refused.
import { world, BlockPermutation, GameMode, Player, Vector3, Direction } from "@minecraft/server";
import { built, DEPTH, HEIGHT } from "./gazebo.js";
import { settings } from "./settings.js";

/** Whether a block position is inside the protected box round the gazebo (none with protection off). */
export function inside(loc: Vector3): boolean {
  const b = built();
  const s = settings();
  if (!b || !b.wood || !s.protectGazebo) return false;
  const r = s.protectedRadius;
  return Math.abs(Math.floor(loc.x) - b.x) <= r && Math.abs(Math.floor(loc.z) - b.z) <= r
    && loc.y >= b.y - DEPTH && loc.y <= b.y + HEIGHT + 5;
}

const creative = (p: Player) => {
  try {
    return p.getGameMode() === GameMode.Creative;
  } catch {
    return false;
  }
};

const FACE: Record<string, Vector3> = {
  [Direction.Up]: { x: 0, y: 1, z: 0 }, [Direction.Down]: { x: 0, y: -1, z: 0 },
  [Direction.North]: { x: 0, y: 0, z: -1 }, [Direction.South]: { x: 0, y: 0, z: 1 },
  [Direction.West]: { x: -1, y: 0, z: 0 }, [Direction.East]: { x: 1, y: 0, z: 0 },
};

const placeable = new Map<string, boolean>();
/** An item places something if a block of that id exists, plus buckets, fire and bone meal. */
function places(id: string): boolean {
  let p = placeable.get(id);
  if (p === undefined) {
    p = /bucket|flint_and_steel|fire_charge|bone_meal/.test(id);
    if (!p) {
      try {
        BlockPermutation.resolve(id);
        p = true;
      } catch {
        p = false;
      }
    }
    placeable.set(id, p);
  }
  return p;
}

export function guard(): void {
  world.beforeEvents.playerBreakBlock.subscribe((ev) => {
    if (inside(ev.block.location) && !creative(ev.player)) ev.cancel = true;
  });

  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (!ev.itemStack || creative(ev.player)) return;
    const o = FACE[ev.blockFace] ?? { x: 0, y: 0, z: 0 };
    const l = ev.block.location;
    const target = { x: l.x + o.x, y: l.y + o.y, z: l.z + o.z };
    if (!inside(l) && !inside(target)) return;
    if (places(ev.itemStack.typeId)) ev.cancel = true;
  });

  world.beforeEvents.explosion.subscribe((ev) => {
    const blocks = ev.getImpactedBlocks();
    const keep = blocks.filter((b) => !inside(b.location));
    if (keep.length !== blocks.length) ev.setImpactedBlocks(keep);
  });
}
