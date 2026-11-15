# Frontline online: https://frontlinesquad.vercel.app

Goal: one link your friends click to play. Everyone automatically gets the same version (multiplayer needs that).
The downloaded HTML keeps working offline; hosting is just an easier way to share it.

## How it's hosted (since 2026-11-15)
- Vercel (free Hobby plan) builds this GitHub repo on every push to `main`, using `vercel.json`: install `npm ci`,
  build `sh scripts/site.sh`, publish the `site/` folder (one `index.html` plus `og.jpg` for link previews).
- To update the game: commit and `git push` to `main`. The link stays the same and everyone gets the new version on
  their next reload.
- Netlify hosted it before; its free plan charges credits for every live update, so it was retired.

## Setting it up again from scratch (about 2 minutes)
1. vercel.com → **Add New… → Project**. If the repo isn't listed, use **Adjust GitHub App Permissions** to allow it.
2. **Import** `frontline-squad`, keep the defaults (vercel.json supplies the settings), **Deploy**.
3. The project name sets the address (`<name>.vercel.app`). Update the links in `index.html` (og:url, og:image) and the
   README if it changes.

## Playing together
- Host: open the link → Multiplayer → Host a game → **Copy invite link** → paste it to friends (Discord, text, etc.).
- Friends: click the invite link. The game opens straight into your lobby (the first time they type a name and press Join).
- Everyone presses **Ready**, the host presses **Start match**.

## Notes
- Works across different Wi-Fi networks: a direct connection is tried first, then a free relay.
- The site is public but only people with the link find it; matches still need your room code.
- Progress (XP, ranks, loadouts) is saved in each player's own browser, per web address. Career → Export/Import moves it
  to another computer or address.
- The claude.ai artifact preview can't reach the matchmaking server, so use the Vercel link (or the downloaded file) for
  multiplayer.
