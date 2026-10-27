# T-ball Scorebook

A responsive, browser-only T-ball scoring app. Set up two teams and batting orders, record each play by moving the batter or runners around the diamond, and download the finished DOT-style scorecard as a JPEG or JSON file.

## Run locally

Open `index.html` in a modern browser. No server, package install, or build step is required. The game is saved automatically in that browser's local storage; use **Export JSON** to keep a portable copy.

## Team roster list

Edit [teams.js](./teams.js) to add the club's reusable teams. The file is loaded locally before the app, so the list works when opening `index.html` directly as well as on a static host. Add an entry with a unique ID, team name, and ordered player names:

```js
window.TEAM_ROSTER_DATA = [
  { id: "tigers", name: "Tigers", players: ["Alex", "Bailey", "Casey"] }
];
```

In game setup, selecting a listed team fills its name and batting roster; those names and order can still be adjusted for the match. Choose **New team** to enter a team name and build a roster from scratch. Custom teams are saved with the game, not written back to `teams.js`.

## Host the app

Upload `index.html`, `styles.css`, `teams.js`, and `app.js` to any static website host (for example GitHub Pages, Netlify, or Cloudflare Pages). The app does not require a backend. Google Fonts are loaded from an external stylesheet; if your host or club network blocks that service, the app falls back to system fonts.

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

- Game setup defaults to 12 innings (choose 1–12), 9 hitters per inning, and 3 outs per inning (both hitter and out counts must be positive whole numbers). Manage each team's ordered roster with add, edit, remove, and move-up/down controls before saving. During a game, player names can be changed and players can be added (up to 40); existing players cannot be deleted or reordered. Player IDs keep earlier scoring attached to the same player when names change.
- Batting order continues from inning to inning. Occupied bases show each runner's name; clicking an occupied base selects that runner. Select a player, then click an empty base or use the direct move options; runners advance automatically in order so no runner is overtaken. Empty bases cannot be selected as destinations when occupied.
- A move records the bases reached. Consecutive automatic and manual advances for a runner within the same batter's play are combined into one route; a new batter starts a new play. Multi-base advances connect the route from the player's starting base and point an arrow at the destination; single-base advances do not draw a connecting arrow. When an inning ends, the next player in the fixed batting order gets a crossover mark: a diagonal from the bottom-left to the top-right of the completed inning box, followed by a horizontal line across the top of that player's next-inning box.
- Use **Skip player** to record a skipped turn without adding an out, for example when a player is injured. A skipped player can be selected later and given a result without adding a duplicate scorecard row; their scoring remains in their original lineup spot.
- Players can be selected and moved, or recorded out, from the diamond without using the lineup list. Automatic runs show a green notice instead of a confirmation prompt. Scoring-rule errors and hitter/out warnings appear immediately above the diamond.
- The inning button names the team and inning that will start next. Press it to end the current team's inning and switch teams; after the other team ends its inning, it advances to the next inning. On the final inning, it indicates that ending will finish the game. Inning crossover marks appear as soon as an inning ends, based on the next player in the fixed batting order.
- Select one or more recorded players in the inning scorecard, then select bases in the order reached and press **Save changes**. For example, Base 1 then Base 3 records that route; Home by itself records a home run; Base 1 then Out records an out after reaching first. Edits are not applied until saved. Correcting plays recalculates the inning runs and outs and updates the score drawing. Run circles are green and out circles are red.
- Any inning can be selected and edited; inning reset controls are not currently included. Undo can correct the most recent scoring action.
- **Undo** and **Redo** navigate the saved scoring history one action at a time to review or correct a play.
- The inning summary reports hitters played, outs, and runs, and displays red warnings above the diamond when the configured hitter or out threshold is reached.
- A new setup replaces the locally saved game after confirmation. Export the JSON first if you want to retain the previous game.
- The JPEG scorecard follows the supplied scorecard layout: visiting and home teams side by side, named team headers, ordered batter names, a field-position column, 12 inning columns with DOT-method diamonds, plus each inning's runs in the upper total segment and the running game total in the lower segment. Date and ground/group details can be entered in game setup.
- On phones, setup and batting order start collapsed after the game is saved. Expanding either section keeps it open while scrolling; it only collapses when you hide it or save a new game setup. Choose **View scorecard** at any time to open an on-screen reference in the same layout as the downloaded JPEG. Open **User manual** for setup, scoring, scorecard, and export instructions; the small information buttons open relevant tips. To share an image, download the JPG and share it from the device's Photos or Files app.

## Tests

Run the scoring behavior tests with `node --test tests/scoring.test.js`. The cases cover scoring notices and limits, roster management, returning skipped players, inning transitions, multi-select scorecard corrections, route dots and arrows, mobile disclosures, base selection, configuration validation, and out recording.
