# Companions

One creature per file, drawn on magenta, nothing else in the frame - the same
shape of drop as `sprites/hats/`. The file name is the id: `cat_ginger.png`
becomes `cat_ginger`, which is what a player's `companionId` holds.

`npm run sprites` keys the magenta, trims to what is left and scales it to 16
pixels wide, which is a creature that reads at a heel without competing with
the 25-pixel figure it follows. Height follows the drawing, because a cat and
a bird are not the same shape.

One drawing each. The companion turns by moving rather than by facing, so a
second view would be a second thing to keep in step for no visible gain.

Empty is the expected state: the slot shipped before the art. In development,
`cc.companion("id")` puts one on your own character.
