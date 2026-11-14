// /spawn_gazebo:build, for operators: a gazebo in a world that already exists, centred where you
// stand. The first run says what it will do; /spawn_gazebo:build confirm within 30 seconds builds it
// there, and the world spawn and the protection move to it. As the Java edition's /spawngazebo build.
import {
  system, Player, Dimension, Vector3, CommandPermissionLevel, CustomCommandOrigin, CustomCommandParamType,
  CustomCommandResult, CustomCommandStatus, StartupEvent,
} from "@minecraft/server";
import { build, built } from "./gazebo.js";
import { HALF } from "./templates.js";

const CONFIRM_TICKS = 30 * 20;
const pending = new Map<string, { x: number; z: number; until: number }>();
const fail = (message: string): CustomCommandResult => ({ status: CustomCommandStatus.Failure, message });

/** A gazebo a new one centred here would land on: the protected one, or an older one by its dome. */
export function gazeboNear(dim: Dimension, cx: number, cz: number): Vector3 | undefined {
  const b = built();
  if (b && b.wood && Math.abs(b.x - cx) <= 2 * HALF && Math.abs(b.z - cz) <= 2 * HALF) return b;
  for (let x = cx - HALF; x <= cx + HALF; x++) {
    for (let z = cz - HALF; z <= cz + HALF; z++) {
      const top = dim.isChunkLoaded({ x, y: 0, z }) ? dim.getTopmostBlock({ x, z }) : undefined;
      if (top && /cut_copper|lightning_rod/.test(top.typeId)) return top.location;
    }
  }
  return undefined;
}
const refuse = (at: Vector3) => fail(`There's already a gazebo here (near ${at.x}, ${at.z}). Stand at least 15 blocks from it to build another.`);

function run(origin: CustomCommandOrigin, confirm?: string): CustomCommandResult {
  const player = origin.sourceEntity;
  if (!(player instanceof Player)) return fail("Run this as a player, standing where the gazebo should go.");
  if (player.dimension.id !== "minecraft:overworld") return fail("The gazebo can only be built in the Overworld.");
  const dim = player.dimension;
  if (!confirm) {
    const x = Math.floor(player.location.x), z = Math.floor(player.location.z);
    const near = gazeboNear(dim, x, z);
    if (near) return refuse(near);
    pending.set(player.id, { x, z, until: system.currentTick + CONFIRM_TICKS });
    const b = built();
    const old = b && b.wood ? ` The old gazebo near ${b.x}, ${b.z} stays standing, but is no longer protected.` : "";
    return {
      status: CustomCommandStatus.Success,
      message: `This builds a gazebo centred here (${x}, ${z}): trees and blocks in a 15 by 15 area are cleared and built over, and the world spawn and the protection move to it.${old} Type /spawn_gazebo:build confirm within 30 seconds to build it.`,
    };
  }
  const p = pending.get(player.id);
  pending.delete(player.id);
  if (!p || system.currentTick > p.until) return fail("Nothing to confirm: run /spawn_gazebo:build first, where you want the gazebo.");
  const near = gazeboNear(dim, p.x, p.z);
  if (near) return refuse(near);
  // Commands can't change the world while they run; the build starts on the next tick.
  system.run(() => {
    system.runJob((function* () {
      try {
        yield* build(dim, p.x, p.z, true);
        const b = built()!;
        player.sendMessage(`Built the gazebo; the world spawn is now in it (${b.x}, ${b.y + 3}, ${b.z}).`);
      } catch (e) {
        console.warn("[Spawn Gazebo] couldn't build the gazebo: " + e);
        player.sendMessage("Couldn't build the gazebo here; the content log says why.");
      }
    })());
  });
  return { status: CustomCommandStatus.Success, message: "Building the gazebo..." };
}

export function registerCommand(ev: StartupEvent): void {
  ev.customCommandRegistry.registerEnum("spawn_gazebo:confirm", ["confirm"]);
  ev.customCommandRegistry.registerCommand({
    name: "spawn_gazebo:build",
    description: "Build a spawn gazebo where you stand (operators)",
    permissionLevel: CommandPermissionLevel.GameDirectors,
    optionalParameters: [{ name: "spawn_gazebo:confirm", type: CustomCommandParamType.Enum }],
  }, run);
}

