# V14 acceptance checks

The build, TypeScript checks and Node regression suite can run without Foundry. They do not establish live world acceptance. A Foundry V14 installation was not available during this update.

Use a V14-compatible PF2e release and enable Astillon Hanaq Adventures 0.8.1. Reload connected clients after installing the build. No Sequencer or JB2A dependency is required.

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

1. Leave **Your Turn Banner** off. Advance initiative. No card should appear.
2. Enable the setting for your user. On the next combatant's turn, a card should slide out beside the right sidebar with a white-outlined portrait, that combatant's name, and “{name}'s turn!” The combat tracker stays usable. Click dismisses it, and it also leaves on its own after a few seconds. Another player's turn, and a GM client with the setting on, should announce that combatant too.
3. Set a portrait override and take your own turn. That image is used. Another combatant's turn still uses their token image, then their actor image. Clear the override and confirm your turn uses your token image, then your actor image.

## Existing content

1. Reimport the four updated racing macros from their compendium. Open each dialog, cancel it, and run its intended action on a test actor. Roll Speed Dice must produce an evaluated chat roll with the selected small-vehicle bonus.
2. Run Sarsaparilla Surprise on an actor with strikes. Change the selected strike and verify its displayed modifier, select Draw, then test Hit, Stand, and window-close behavior. Confirm the result chat card and card-stack expansion work for GM and player clients.
3. Verify the Sarsaparilla animations appear on both connected clients. Confirm compendia open and their existing document IDs and references remain intact.
