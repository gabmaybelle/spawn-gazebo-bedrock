// Spawn Gazebo for Bedrock: every new world starts in a little round stone gazebo.
import { world, system } from "@minecraft/server";
import { build, buildWhenReady, built, welcome } from "./gazebo.js";
import { guard } from "./guard.js";
import { gazeboNear, registerCommand } from "./command.js";

export const VERSION = "0.1.0";

guard();
system.beforeEvents.startup.subscribe(registerCommand);
world.afterEvents.worldLoad.subscribe(() => {
  console.log(`[Spawn Gazebo] ${VERSION}: script loaded`);
  buildWhenReady();
});
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (ev.initialSpawn) welcome(ev.player);
});

// For the self-test pack (test worlds only, where /scriptevent is open): what was built, and the
// build command's steps without a player to type it. Each answers with a script event reply.
const reply = (o: object) => system.sendScriptEvent("spawn_gazebo:debug_reply", JSON.stringify({ built: built(), spawn: world.getDefaultSpawnLocation(), ...o }));
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "spawn_gazebo:debug") reply({});
  if (ev.id === "spawn_gazebo:debug_build") {
    const [x, z] = ev.message.split(" ").map(Number);
    const dim = world.getDimension("minecraft:overworld");
    const near = gazeboNear(dim, x, z);
    if (near) {
      reply({ refused: true });
      return;
    }
    system.runJob((function* () {
      yield* build(dim, x, z, true);
      reply({ refused: false });
    })());
  }
});
