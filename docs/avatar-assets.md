# Avatar assets and replacement guide

The six supplied PNGs in `src/assets/avatar/` are visual references. Their bodies,
hair, clothes and props were drawn as separate illustrations with different poses
and coordinates, so they cannot be reliably overlaid as a dress-up character.
`src/assets/avatar/cropped/` contains the older, individually cropped references;
the application no longer uses those images for the assembled avatar.

The current application renders transparent sprites from
`src/assets/avatar/layers/sprites/` in `CharacterAvatar`. The corresponding source
images are in `layers/source/`. `src/data/avatar-layers.json` defines crop rectangles
and positions in the shared 400 × 600 SVG canvas. To rebuild the sprites, run
`node scripts/build-avatar-layers.mjs`. `src/data/avatarLayers.ts` imports the
resulting files; `AvatarReferencePreview` uses them for the wardrobe options.
The same avatar component appears in the room, profile and ledger, and saved
selections are persisted by the Zustand store.

These generated layers are a functional placeholder. Their body differs from the
original character, and several clothing and accessory silhouettes are not
registered perfectly to it. Further coordinate tweaks alone cannot make every
combination match. The replacement set needs one approved neutral body and one
transparent PNG per part, all exported on an identical canvas with the same pose,
scale and neck/shoulder/waist/hand/foot anchors. Hair should be split into front
and back layers; outfits must match the body's arm position. Test the base with
one outfit and one hairstyle before producing the full set.

`tests/avatar-composition.spec.ts` verifies that selections change the rendered
pixels, transparent corners stay clear, and saved choices appear across screens.
It does not certify visual alignment of the artwork. The current stage is suitable
for saving and functional review while the final registered art is produced.
