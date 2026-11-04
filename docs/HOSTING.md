# Put Frontline online (free, about 2 minutes)

Goal: one link your friends click to play. Everyone automatically gets the same version (multiplayer needs that).
The downloaded HTML keeps working offline; hosting is just an easier way to share it.

## First time (Netlify Drop)
1. Unzip `frontline_site.zip`. You get a folder `frontline_site` with one file, `index.html`.
2. Open https://app.netlify.com/drop and drag the `frontline_site` folder onto the page.
3. Netlify gives you a link like `https://random-name-123.netlify.app`. Sign up (free; email or Google/GitHub) when it asks,
   so the site stays up permanently instead of expiring.
4. Optional: rename it. In the site's settings, use "Change site name" (for example `frontline-squad` →
   `https://frontline-squad.netlify.app`).
5. Send the link to your friends. That's it: no install, no account for them.

(Button names on Netlify can change slightly over time; the flow stays drag, sign up, share.)

## Playing together
- Host: open the link → Multiplayer → Host a game → **Copy invite link** → paste it to friends (Discord, text, etc.).
- Friends: click the invite link. The game opens straight into your lobby (the first time they type a name and press Join).
- Everyone presses **Ready**, the host presses **Start match**.

## Updating to a new version
Open your site on Netlify → **Deploys** → drag the new `frontline_site` folder onto the deploy area. The link stays the
same and everyone gets the new version on their next reload.

## Notes
- Works across different Wi-Fi networks: a direct connection is tried first, then a free relay.
- The site is public but only people with the link find it; matches still need your room code.
- Progress (XP, ranks, loadouts) is saved in each player's own browser. Career → Export/Import moves it to another computer.
- The claude.ai artifact preview can't reach the matchmaking server, so use the Netlify link (or the downloaded file) for multiplayer.
