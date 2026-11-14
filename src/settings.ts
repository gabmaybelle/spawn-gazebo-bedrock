// The settings (the Java edition's config file and settings screen), kept in the world, changed with
// /spawn_gazebo:settings (operators) in a form. The gazebo itself is built on a world's first load,
// before anyone can open the form, so the chest settings count for the build command and for the kit
// later players are handed; the protection settings count at once.
import { world, system, Player } from "@minecraft/server";
import { FormCancelationReason, FormRejectError, FormRejectReason, ModalFormData } from "@minecraft/server-ui";

export const STARTER_KIT = "starter_kit";
export const BONUS_CHEST = "bonus_chest";
/** The gazebo reaches this far from its middle; the protection can't be smaller. */
export const MIN_RADIUS = 7, MAX_RADIUS = 64;

export interface Settings {
  starterChest: boolean; // a chest in the railing with the kit
  chestLoot: string; // STARTER_KIT, BONUS_CHEST or a loot table path such as "chests/village/village_plains_house"
  protectGazebo: boolean;
  protectedRadius: number;
}
const DEFAULTS: Settings = { starterChest: true, chestLoot: STARTER_KIT, protectGazebo: true, protectedRadius: 12 };
const KEY = "spawn_gazebo:settings";

let cached: Settings | undefined;
export function settings(): Settings {
  if (!cached) {
    let saved: Partial<Settings> = {};
    try {
      const raw = world.getDynamicProperty(KEY);
      if (typeof raw === "string") saved = JSON.parse(raw);
    } catch {
      saved = {};
    }
    cached = clean({ ...DEFAULTS, ...saved });
  }
  return cached;
}
function clean(s: Settings): Settings {
  return {
    starterChest: s.starterChest !== false,
    chestLoot: typeof s.chestLoot === "string" && s.chestLoot.trim() ? s.chestLoot.trim() : STARTER_KIT,
    protectGazebo: s.protectGazebo !== false,
    protectedRadius: Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, Math.round(Number(s.protectedRadius) || DEFAULTS.protectedRadius))),
  };
}
export function saveSettings(s: Settings): void {
  cached = clean(s);
  world.setDynamicProperty(KEY, JSON.stringify(cached));
}

/** The loot table a roll of the chest's loot comes from, or undefined for the starter kit. */
export function lootTable(): string | undefined {
  const l = settings().chestLoot;
  if (l === STARTER_KIT) return undefined;
  if (l === BONUS_CHEST) return "chests/spawn_bonus_chest";
  return l.replace(/^minecraft:/, "").replace(/^loot_tables\//, "").replace(/\.json$/, "");
}

const LOOT = [STARTER_KIT, BONUS_CHEST, "other"];
const LOOT_NAMES = ["Starter kit", "Bonus chest loot", "Another loot table (below)"];

export async function openSettings(player: Player): Promise<void> {
  const s = settings();
  const custom = LOOT.indexOf(s.chestLoot) < 0;
  const form = new ModalFormData()
    .title("Spawn Gazebo Settings")
    .toggle("Starter chest", { defaultValue: s.starterChest, tooltip: "A chest in the gazebo's railing. Counts for gazebos built with /spawn_gazebo:build, and for the kit later players are handed." })
    .dropdown("What the chest holds", LOOT_NAMES, { defaultValueIndex: custom ? 2 : LOOT.indexOf(s.chestLoot), tooltip: "The starter kit is a bed, torches, bread, saplings and a bundle. The bonus chest loot is vanilla's: a few tools, logs, food and seeds." })
    .textField("Loot table", "chests/village/village_plains_house", { defaultValue: custom ? s.chestLoot : "", tooltip: "Used when \"Another loot table\" is picked above." })
    .toggle("Protect the gazebo", { defaultValue: s.protectGazebo, tooltip: "Nobody outside creative can break or build in it, and explosions leave it alone." })
    .slider("Protected radius", MIN_RADIUS, MAX_RADIUS, { defaultValue: s.protectedRadius, valueStep: 1, tooltip: "How far from the gazebo's middle the protection reaches: 7 is the gazebo itself, more takes in the ground round it." })
    .submitButton("Save");
  for (let tries = 0; tries < 40; tries++) {
    let r;
    try {
      r = await form.show(player);
    } catch (e) {
      if (e instanceof FormRejectError && e.reason === FormRejectReason.PlayerQuit) return;
      throw e;
    }
    // The chat is still open from typing the command: try again in a moment.
    if (r.cancelationReason === FormCancelationReason.UserBusy) {
      await new Promise<void>((done) => system.runTimeout(() => done(), 5));
      continue;
    }
    if (r.canceled || !r.formValues) return;
    const [chest, loot, table, protect, radius] = r.formValues;
    const pick = LOOT[typeof loot === "number" ? loot : 0];
    saveSettings({
      starterChest: chest !== false,
      chestLoot: pick === "other" ? String(table ?? "").trim() || STARTER_KIT : pick,
      protectGazebo: protect !== false,
      protectedRadius: typeof radius === "number" ? radius : s.protectedRadius,
    });
    player.sendMessage("Spawn Gazebo settings saved.");
    return;
  }
}
