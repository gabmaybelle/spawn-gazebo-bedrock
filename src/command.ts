// /spawn_gazebo:build, for operators: a gazebo in a world that already exists, centred where you
// stand. It opens a box saying what it will do, with Build here and Cancel (a tap, so it works on a
// phone); /spawn_gazebo:build confirm within two minutes does the same for keyboard players. The
// world spawn and the protection move to the new gazebo. As the Java edition's /spawngazebo build.
import {
  system, Player, Dimension, Vector3, CommandPermissionLevel, CustomCommandOrigin, CustomCommandParamType,
  CustomCommandResult, CustomCommandStatus, StartupEvent,
} from "@minecraft/server";
import { FormCancelationReason, FormRejectError, MessageFormData } from "@minecraft/server-ui";
import { build, built } from "./gazebo.js";
import { openSettings } from "./settings.js";
import { HALF } from "./templates.js";

const CONFIRM_TICKS = 120 * 20;
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
const alreadyHere = (at: Vector3) => `There's already a gazebo here (near ${at.x}, ${at.z}). Stand 15 blocks away to build another.`;

/** Builds where the player asked, if nothing has changed there since. */
function confirmBuild(player: Player, p: { x: number; z: number }): void {
  const dim = player.dimension;
  const near = gazeboNear(dim, p.x, p.z);
  if (near) {
    player.sendMessage(alreadyHere(near));
    return;
  }
  system.runJob((function* () {
    try {
      yield* build(dim, p.x, p.z, true);
      const b = built()!;
      player.sendMessage(`Built the gazebo; spawn is now in it (${b.x}, ${b.y + 3}, ${b.z}).`);
    } catch (e) {
      console.warn("[Spawn Gazebo] couldn't build the gazebo: " + e);
      player.sendMessage("Couldn't build the gazebo here; the content log says why.");
    }
  })());
}

/** The box: what will happen, and two buttons. Waits while the chat is still open. */
async function ask(player: Player, p: { x: number; z: number }): Promise<void> {
  const b = built();
  const old = b && b.wood ? `\n\nThe old gazebo (${b.x}, ${b.z}) stays, unprotected.` : "";
  const form = new MessageFormData()
    .title("Build a gazebo here?")
    .body(`Centred at ${p.x}, ${p.z}. Clears a 15 × 15 area. Spawn and protection move here.${old}`)
    .button1("Build here")
    .button2("Cancel");
  for (let tries = 0; tries < 40; tries++) {
    let r;
    try {
      r = await form.show(player);
    } catch (e) {
      if (e instanceof FormRejectError) return;
      throw e;
    }
    if (r.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise<void>((done) => system.runTimeout(() => done(), 5));
      continue;
    }
    if (r.canceled || r.selection !== 0) return;
    pending.delete(player.id);
    confirmBuild(player, p);
    return;
  }
}

function run(origin: CustomCommandOrigin, confirm?: string): CustomCommandResult {
  const player = origin.sourceEntity;
  if (!(player instanceof Player)) return fail("Run this as a player, standing where the gazebo should go.");
  if (player.dimension.id !== "minecraft:overworld") return fail("The gazebo can only be built in the Overworld.");
  if (!confirm) {
    const x = Math.floor(player.location.x), z = Math.floor(player.location.z);
    const near = gazeboNear(player.dimension, x, z);
    if (near) return fail(alreadyHere(near));
    const p = { x, z, until: system.currentTick + CONFIRM_TICKS };
    pending.set(player.id, p);
    system.run(() => void ask(player, p));
    return { status: CustomCommandStatus.Success };
  }
  const p = pending.get(player.id);
  pending.delete(player.id);
  if (!p || system.currentTick > p.until) return fail("Nothing to confirm: run /spawn_gazebo:build first, where you want the gazebo.");
  // Commands can't change the world while they run; the build starts on the next tick.
  system.run(() => confirmBuild(player, p));
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
  ev.customCommandRegistry.registerCommand({
    name: "spawn_gazebo:settings",
    description: "Open the Spawn Gazebo settings (operators)",
    permissionLevel: CommandPermissionLevel.GameDirectors,
  }, (origin) => {
    const player = origin.sourceEntity;
    if (!(player instanceof Player)) return fail("Run this as a player: the settings open as a form.");
    system.run(() => void openSettings(player));
    return { status: CustomCommandStatus.Success };
  });
}

