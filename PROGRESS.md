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
- `/spawn_gazebo:build` (operators): says what it will do where you stand; `/spawn_gazebo:build confirm`
  within 30 seconds builds it there and moves the spawn and the protection. Refused on top of a gazebo.
  The headless test runs its steps (refused on the gazebo, built 40 blocks away, every block, the chest).

## Open

- The sandstone gazebo and the lava cooling are built but no test seed has reached a desert or lava yet.
- Corner stairs on the dome and steps, and the railing's look: need eyes in the game.
- Player breaking and placing can't be checked headless.
- Fire and pistons: no cancelable stable event.
- The later players' kit and typing the command need a player: not checkable headless.
- Next: the settings form (session 4).
