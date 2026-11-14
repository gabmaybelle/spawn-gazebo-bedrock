# Progress

## Done

- The gazebo, every wood (oak, spruce, birch, jungle, acacia, dark oak, mangrove, cherry, pale oak,
  bamboo, poplar) and both palettes (stone, sand): 22 structure files made from the Java edition's own
  generator, flower pots and decorated pots (contents and sherds) included.
- Built once at the world spawn's ground, turned one of four ways at random. The wood is the most common
  tree within 32 blocks, else the biome's; deserts and badlands get sandstone.
- The footprint cleared 18 blocks up, leaves left hanging by felled trees removed, a foundation under
  anything over a drop, lava near the surface within 16 blocks set to stone.
- Spawn moved to the gazebo's middle, spawn radius 0; players already in the world are moved in.
- The starter chest: a bed, 16 torches, 6 bread, 4 oak saplings, a bundle.
- Protection inside 12 blocks: survival breaking and placing (held blocks, buckets, fire, bone meal)
  refused; explosions leave it alone.
- The headless test passes on a flat world and seven real-terrain seeds (oak, dark oak; all four turns):
  every block of the template in place, spawn, chest, no lava, TNT and a creeper inside change nothing,
  TNT outside still digs.

- Later players: the first player to join takes the chest; everyone after them is handed their own
  kit (into their inventory, any overflow at their feet), once each.
- `/spawn_gazebo:build` (operators): opens a box saying what it will do where you stand, with Build here and
  Cancel (a tap, for phones); `/spawn_gazebo:build confirm` within two minutes does the same. Refused on a gazebo.
  The headless test runs its steps (refused on the gazebo, built 40 blocks away, every block, the chest).

- Settings (`/spawn_gazebo:settings`, operators, a form; kept in the world): starter chest on or off,
  what it holds (starter kit, vanilla's bonus chest loot, or any loot table), protection on or off, and
  the protected radius (7 to 64). The gazebo is built on a world's first load, before anyone can open
  the form, so the chest settings count for the build command and later players' kits. The Java
  "spawnGazebo" switch has no Bedrock form: turning the pack off is the same thing.
- The headless suite: 16 cases, passing on a flat world and two real-terrain seeds.
- Played on a phone (2026-11-14): the gazebo's look, the corner stairs and the railing are right; the
  chest holds the kit; survival breaking and placing are refused inside and work outside; the build
  command's box builds a second gazebo.

## Open

- The sandstone gazebo and the lava cooling are built but no test seed has reached a desert or lava yet.
- Fire and pistons: no cancelable stable event.
- Not yet checked in the game: the settings form on a phone, a second player's kit.
- Next: release session R: a desert seed in the tests, the name check, the changelog, the listing kit and cross-links.
