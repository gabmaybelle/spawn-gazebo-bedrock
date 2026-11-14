// Spawn Gazebo for Bedrock: every new world starts in a little round stone gazebo.
import { world, system } from "@minecraft/server";
import { buildWhenReady, built } from "./gazebo.js";
import { guard } from "./guard.js";

export const VERSION = "0.1.0";

guard();
world.afterEvents.worldLoad.subscribe(() => {
  console.log(`[Spawn Gazebo] ${VERSION}: script loaded`);
  buildWhenReady();
});

// For the self-test pack (test worlds only): what was built, as a script event reply.
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== "spawn_gazebo:debug") return;
  system.sendScriptEvent("spawn_gazebo:debug_reply", JSON.stringify({ built: built(), spawn: world.getDefaultSpawnLocation() }));
});
