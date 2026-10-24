# T-ball Scorebook

A responsive, browser-only T-ball scoring app. Set up two teams and batting orders, record each play by moving the batter or runners around the diamond, and download the finished DOT-style scorecard as a JPEG or JSON file.

## Run locally

Open `index.html` in a modern browser. No server, package install, or build step is required. The game is saved automatically in that browser's local storage; use **Export JSON** to keep a portable copy.

## Host the app

Upload `index.html`, `styles.css`, and `app.js` to any static website host (for example GitHub Pages, Netlify, or Cloudflare Pages). The app does not require a backend. Google Fonts are loaded from an external stylesheet; if your host or club network blocks that service, the app falls back to system fonts.

## Embed on Squarespace

The most reliable Squarespace setup is to host these static files separately, then add an **Embed** block to a Squarespace page and paste an iframe that points to the hosted `index.html`:

```html
<iframe
  src="https://YOUR-STATIC-HOST.example/"
  title="T-ball Scorebook"
  width="100%"
  height="1200"
  style="border:0; border-radius:12px"
  loading="lazy">
</iframe>
```

Replace the `src` with the public URL of the hosted app and adjust the iframe height to suit the page. You may also place the files directly on a host and link to the app from Squarespace.

## Scoring notes

- The inning-ending rule is selected when setting up the game: three outs (default) or everyone in the lineup bats.
- Batting order continues from inning to inning. Occupied bases show each runner's name; tapping an occupied base selects that runner. Move options include every base ahead of their current position, and runners advance automatically in order so no runner is overtaken. A confirmation is requested before any runner is scored.
- Players can be selected and moved, or recorded out, from the diamond without using the lineup list. Selecting a player also opens direct move options. Scoring-rule errors and inning-limit messages appear beside the diamond.
- **Undo** and **Redo** navigate the saved scoring history one action at a time to review or correct a play.
- The inning summary warns when the selected rule's limit is reached and also reports when all players have batted or three outs have been recorded.
- A new setup replaces the locally saved game after confirmation. Export the JSON first if you want to retain the previous game.
- The JPEG scorecard follows the supplied scorecard layout: visiting and home teams side by side, ordered batter names, a field-position column, 12 inning columns with DOT-method diamonds, plus inning and running totals. Date and ground/group details can be entered in game setup.
- Choose **View scorecard** at any time to open an on-screen reference in the same layout as the downloaded JPEG.
