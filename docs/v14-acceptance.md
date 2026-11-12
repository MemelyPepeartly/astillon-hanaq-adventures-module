# V14 acceptance checks

The build, TypeScript checks and Node regression suite can run without Foundry. They do not establish live world acceptance. A Foundry V14 installation was not available during this update.

Use a V14-compatible PF2e release and enable Astillon Hanaq Adventures 0.10.2. Reload connected clients after installing the build. Menacing and Your Turn do not require Sequencer or JB2A; Blaster's optional integrations have their own [acceptance checks](blaster-acceptance.md).

## Menacing

1. As GM, open a token's standard status palette. Find **Menacing**, click it, and confirm an animated purple symbol appears at the upper-right edge. The status control should highlight. Ordinary conditions such as Frightened must still work.
2. Move, drag, resize, rotate, and zoom around the token. The symbol should follow smoothly and stay upright. Toggle it off and confirm immediate removal. Repeat quickly to check for duplicates.
3. Place two linked tokens of the same actor. Enable Menacing on one; the other must remain unchanged. Actor statistics, conditions, and effects must be unchanged.
4. Connect a player who owns a token. Toggle Menacing from that client; both clients should agree. A user without ownership must not change the flag. Reload a client and switch away from/back to the scene; the animation should return exactly once.
5. Hide the token as GM and test player vision, fog, wall occlusion, detection-only visibility, and V14 scene levels. Players must never see Menacing when its token artwork is not visible. The GM should see a dimmed symbol for a hidden token.
6. Delete a token with Menacing active; no symbol should remain. Switch scenes while assets are loading; no symbol from the old scene should appear on the new scene.
7. Change PF2e's condition icon theme and death icon. Reopen the palette; Menacing should still be present and toggle normally.
8. Tab to Menacing and use Enter/Space. Right-click the status. Each interaction should toggle once, without changing the token's large overlay status.

## Your Turn

1. Leave **Your Turn Cut-In** off. Advance initiative. No cut-in should appear. From an actor sheet you can edit, open Your Turn and choose Preview. The draft plays anyway, without enabling the setting, writing flags, or advancing combat. A sheet you cannot edit has no control.
2. Enable the setting for your user. On the next change of combatant, round, or turn, one cut-in should enter from the lower right of the map. A dark jagged wedge, a theme-colored panel, a lighter shard, and white speed lines should be visible behind the portrait. The banner is a black brush shape with a white edge. The large line is the combatant's name and the smaller line is YOUR TURN. The portrait has a thick white outline. Most of the map to the left stays visible and clickable. The cut-in leaves on its own. Another player's combatant, and a GM client with the setting on, should announce that combatant too. Collapse the sidebar or resize the window: the playing graphic stays at its original measured position and does not replay.
3. Save a custom image and color on the actor. That image is used, then the same flag on the token's base actor, then the actor image, then the token image. Clear the image and confirm the actor image is used, then the token image. An invalid color falls back to #2B8CFF. With reduced motion enabled, the cut-in fades in and out together instead of slamming in layers.
4. In the real actor editor, click **Browse**: Foundry's file browser must open, and choosing an image must populate the path without closing the editor. Change the color and **Preview**: the draft plays without saving. **Save**, close, and reopen: both values persist. Repeat with two different actors' editors open and verify neither editor reads or saves the other's fields. Confirm an actual failed save produces a notification.
5. Reload GM and player clients with custom art on a world actor, an unlinked scene token, and a combatant. Observe startup image requests in the browser Network panel, or await `game.astillonHanaqAdventures["your-turn"].preload()`. Advance to those actors' first turns: the portrait and shared slices must be ready for the full animation rather than appearing halfway through. No world documents should be written by preloading.
6. Throttle the network and select a new image. Before it is ready, there must be no empty timed flash-in. Once decoded, its full 2.6-second timeline starts. Advance past that combatant while its image loads, cancel a preview, or leave the scene: no obsolete cut-in may appear later. A broken custom image should fall back without poisoning subsequent valid images. Saving changed artwork on another client should warm it on this client too.

## Existing content

1. Reimport the four updated racing macros from their compendium. Open each dialog, cancel it, and run its intended action on a test actor. Roll Speed Dice must produce an evaluated chat roll with the selected small-vehicle bonus.
2. Run Sarsaparilla Surprise on an actor with strikes. Change the selected strike and verify its displayed modifier, select Draw, then test Hit, Stand, and window-close behavior. Confirm the result chat card and card-stack expansion work for GM and player clients.
3. Verify the Sarsaparilla animations appear on both connected clients. Confirm compendia open and their existing document IDs and references remain intact.
