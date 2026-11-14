# Changelog

## 0.1.0

The first Bedrock release of Spawn Gazebo. Minecraft Bedrock 1.26.60 or newer, no experiments.

- A little round stone gazebo at the world spawn, built on the world's first load: a stepped plinth,
  stripped-log pillars, arched openings, a weathered copper dome with a lightning rod, a spore blossom
  over a glowstone floor, benches, potted saplings, decorated pots with seeds to break open, and
  lanterns under the eaves and by the steps.
- Built from the wood that grows nearest the spawn (oak, spruce, birch, jungle, acacia, dark oak,
  mangrove, cherry, pale oak, bamboo or poplar), or the biome's own tree when there are none; sandstone
  in deserts and badlands. Turned one of four ways at random.
- Trees in the way are cleared, with the leaves they leave hanging; a foundation goes under any edge
  over a drop; lava near the surface within 16 blocks is set to stone.
- The world spawn moves to the middle of the gazebo, and the spawn radius to 0.
- A starter chest: a bed, 16 torches, 6 bread, 4 saplings and a bundle. The first player takes it;
  everyone who joins after them is handed their own kit.
- Protection: outside creative, nobody can break or build within 12 blocks of the middle, and
  explosions leave it alone.
- `/spawn_gazebo:build` (operators): builds a gazebo where you stand in a world you already have, after
  a Build here or Cancel box. The spawn and the protection move to it.
- `/spawn_gazebo:settings` (operators): the starter chest on or off, what it holds (the starter kit,
  the bonus chest's loot or any loot table), protection on or off, and the protected radius (7 to 64).
