# Spawn Gazebo for Bedrock

Every new world starts in a little round stone gazebo instead of a random patch of grass: a weathered
copper dome on stripped-log pillars, a spore blossom over a glowstone floor, benches, pots, lanterns,
and a chest with a bed, torches, bread, saplings and a bundle. It's built from the wood growing around
you, in sandstone in deserts and badlands, and you wake up inside it.

The Bedrock add-on of [Spawn Gazebo](https://github.com/gabmaybelle/spawn-gazebo) for Java. Both editions
build the same gazebo from one design.

- Turn the behaviour pack on when you create the world: the gazebo is built at the world spawn on the
  world's first load.
- Survival players can't break or build within 12 blocks of it, and explosions leave it alone.
- Stable script APIs only, no experiments, so it works on Realms and consoles.

## Building

`npm install`, then `npm run build`. The gazebo comes from the Java repo at the commit in
`java-source.json`; the add-on lands in `dist/`.

Made by Gabby. MIT licence.
