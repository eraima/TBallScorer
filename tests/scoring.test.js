"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

class FakeElement {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.listeners = new Map();
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.open = false;
    this.classList = {
      add: name => this.toggleClass(name, true),
      remove: name => this.toggleClass(name, false),
      toggle: (name, force) => this.toggleClass(name, force),
      contains: name => (this.className || "").split(/\s+/).includes(name)
    };
  }

  toggleClass(name, force = !this.classList.contains(name)) {
    const classes = new Set((this.className || "").split(/\s+/).filter(Boolean));
    if (force) classes.add(name);
    else classes.delete(name);
    this.className = [...classes].join(" ");
  }

  addEventListener(type, listener) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  click() {
    for (const listener of this.listeners.get("click") || []) listener({ preventDefault() {} });
    this.onclick?.({ preventDefault() {} });
  }

  append(...elements) {
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    this.children = [...elements];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === "open") this.open = true;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  getContext() {
    if (this.context) return this.context;
    this.context = {
      strokes: [],
      path: [],
      lineWidth: 1,
      scale() {},
      fillRect() {},
      strokeRect() {},
      measureText: text => ({ width: String(text).length * 8 }),
      fillText() {},
      beginPath() {
        this.path = [];
      },
      moveTo(x, y) {
        this.path.push([x, y]);
      },
      lineTo(x, y) {
        this.path.push([x, y]);
      },
      stroke() {
        this.strokes.push({ lineWidth: this.lineWidth, path: [...this.path] });
      },
      arc() {},
      fill() {},
      save() {},
      rect() {},
      clip() {},
      restore() {},
      closePath() {}
    };
    return this.context;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === "open") this.open = false;
  }

  querySelector(selector) {
    return selector === ".base-occupant" ? (this.occupant ||= new FakeElement()) : null;
  }

  querySelectorAll(selector) {
    return this.id === "diamond" && selector === ".base[data-base]" ? this.bases : [];
  }
}

function createGame() {
  const teams = ["home", "away"].map((id, teamIndex) => ({
    id,
    name: teamIndex ? "Away" : "Home",
    players: ["Player 1", "Player 2", "Player 3"].map((name, index) => ({
      id: `${id}-${index + 1}`,
      name,
      order: index + 1
    })),
    nextBatterIndex: 0,
    innings: {}
  }));
  return {
    version: 1,
    name: "Test game",
    date: "2026-10-24",
    ground: "",
    innings: 2,
    playersPerInning: 9,
    outsPerInning: 3,
    teams
  };
}

function startApp(savedGame = createGame(), mobile = false, staticTeamData = []) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const infoButton = new FakeElement("info-button");
  infoButton.dataset.help = "Context help text.";
  infoButton.setAttribute("aria-label", "More information about scoring");
  const scorecardRouteBases = [1, 2, 3, 4].map(base => {
    const button = elements.get(base === 4 ? "scorecard-home" : `scorecard-base-${base}`);
    button.dataset.base = String(base);
    return button;
  });
  const scorecardTerminals = ["scorecard-out", "scorecard-skip"].map((id, index) => {
    const button = elements.get(id);
    button.dataset.terminal = index === 0 ? "out" : "skipped";
    return button;
  });
  const bases = [1, 2, 3, 4].map(base => {
    const button = new FakeElement();
    button.dataset.base = String(base);
    return button;
  });
  elements.get("diamond").bases = bases;
  const storage = new Map();
  if (savedGame) storage.set("tball-scorebook-game-v1", JSON.stringify(savedGame));
  const confirmations = [];
  const alerts = [];
  const document = {
    querySelector(selector) {
      return elements.get(selector.slice(1)) || null;
    },
    querySelectorAll(selector) {
      if (selector === ".info-button") return [infoButton];
      if (selector === ".scorecard-route-base") return scorecardRouteBases;
      if (selector === ".scorecard-terminal") return scorecardTerminals;
      return [];
    },
    createElement(tagName) {
      const element = new FakeElement();
      if (tagName === "canvas") element.toDataURL = () => "";
      return element;
    },
    body: new FakeElement("body")
  };
  const windowListeners = new Map();
  const context = {
    document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    window: {
      TEAM_ROSTER_DATA: staticTeamData,
      confirm(message) {
        confirmations.push(message);
        return true;
      },
      alert(message) {
        alerts.push(message);
      },
      matchMedia() {
        return { matches: mobile };
      },
      addEventListener(type, listener) {
        const listeners = windowListeners.get(type) || [];
        listeners.push(listener);
        windowListeners.set(type, listeners);
      },
      setTimeout
    },
    console,
    Date,
    Math,
    JSON,
    Map,
    Set,
    Number,
    Array
  };
  vm.runInNewContext(appSource, context, { filename: "app.js" });

  function clickBase(base) {
    bases[base - 1].click();
  }

  function moveNextBatterTo(base) {
    elements.get("diamond-next-player").click();
    clickBase(base);
  }

  function selectPlayer(index) {
    elements.get("lineup-list").children[index].click();
  }

  function chooseMove(label) {
    const button = elements.get("player-move-options").children.find(child => child.textContent === label);
    assert.ok(button, `Expected a ${label} move option`);
    button.click();
  }

  function change(element) {
    for (const listener of element.listeners.get("change") || []) listener({ target: element });
  }

  function setInning(number) {
    const select = elements.get("inning-select");
    select.value = String(number);
    for (const listener of select.listeners.get("change") || []) listener();
  }

  function currentGame() {
    return JSON.parse(storage.get("tball-scorebook-game-v1"));
  }

  function resizeTo(nextMobile) {
    mobile = nextMobile;
    for (const listener of windowListeners.get("resize") || []) listener();
  }

  return { elements, infoButton, confirmations, alerts, clickBase, moveNextBatterTo, selectPlayer, chooseMove, setInning, currentGame, resizeTo, change };
}

test("moving a batter directly home records a run without confirmation", () => {
  const app = startApp();

  app.moveNextBatterTo(4);

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 1);
  assert.equal(app.currentGame().teams[0].innings[1].atBats[0].status, "run");
});

test("a batter moved directly to second marks and connects first and second", () => {
  const app = startApp();

  app.moveNextBatterTo(2);

  const atBat = app.currentGame().teams[0].innings[1].atBats[0];
  assert.deepEqual(atBat.path, [2]);
  assert.deepEqual(atBat.advances, [{ from: 4, to: 2 }]);
  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.equal(progress.children.filter(child => child.className === "base-dot").length, 3);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 2);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 1);
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => child.dataset.base), ["4", "1", "2"]);
});

test("runner advances mark every base passed and point to the stopping base", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.clickBase(1);
  app.clickBase(3);

  const atBat = app.currentGame().teams[0].innings[1].atBats[0];
  assert.deepEqual(atBat.path, [1, 3]);
  assert.deepEqual(atBat.advances, [{ from: 4, to: 3 }]);
  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.equal(progress.children.filter(child => child.className === "base-dot").length, 4);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 3);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 1);
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => child.dataset.base), ["4", "1", "2", "3"]);
});

test("manual move combines a runner's automatic advance within the same batter's play", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.elements.get("diamond-next-player").click();
  app.chooseMove("First");
  app.selectPlayer(0);
  app.chooseMove("Third");

  const atBat = app.currentGame().teams[0].innings[1].atBats[0];
  assert.deepEqual(atBat.advances, [{ from: 4, to: 1 }, { from: 1, to: 3 }]);
  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 2);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 1);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow")[0].title, "Stopped at Third");
});

test("a new batter starts a new play for runner advance accumulation", () => {
  const game = createGame();
  game.teams[0].players.push({ id: "home-4", name: "Player 4", order: 4 });
  const app = startApp(game);
  app.moveNextBatterTo(1);
  app.elements.get("diamond-next-player").click();
  app.chooseMove("First");
  app.elements.get("diamond-next-player").click();
  app.chooseMove("First");
  app.selectPlayer(0);
  app.chooseMove("Home");

  const atBat = app.currentGame().teams[0].innings[1].atBats[0];
  assert.deepEqual(atBat.advances, [{ from: 4, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 4 }]);
});

test("a single-base advance adds a dot without connecting bases", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.elements.get("diamond-next-player").click();
  app.chooseMove("First");

  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.equal(progress.children.filter(child => child.className === "base-dot").length, 2);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 0);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 0);
});

test("a home run shows four linked dots and an arrow at home", () => {
  const app = startApp();
  app.moveNextBatterTo(4);

  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => Number(child.dataset.base)).sort(), [1, 2, 3, 4]);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 4);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 1);
  assert.deepEqual(progress.children.filter(child => child.className === "dot-connection").map(child => child.style.left), ["50%", "86%", "50%", "14%"]);
});

test("a runner scoring from first base starts the route at first base", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.elements.get("diamond-next-player").click();
  app.chooseMove("First");
  app.selectPlayer(0);
  app.chooseMove("Home");

  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => Number(child.dataset.base)).sort(), [1, 2, 3, 4]);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 3);
  assert.deepEqual(progress.children.filter(child => child.className === "dot-connection").map(child => child.style.left), ["86%", "50%", "14%"]);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow")[0].style.left, "50%");
});

test("inning transitions connect each final batter diagonally to the next starter for both teams", () => {
  const game = createGame();
  for (const [teamIndex, team] of game.teams.entries()) {
    team.players.push(
      { id: `${team.id}-4`, name: "Player 4", order: 4 },
      { id: `${team.id}-5`, name: "Player 5", order: 5 },
      { id: `${team.id}-6`, name: "Player 6", order: 6 },
      { id: `${team.id}-7`, name: "Player 7", order: 7 }
    );
    team.innings[1] = {
      outs: 3,
      runs: 0,
      complete: false,
      atBats: team.players.slice(0, teamIndex === 0 ? 6 : 3).map((player, index) => ({
        playerId: player.id,
        path: [],
        status: index === (teamIndex === 0 ? 5 : 2) ? "out" : "onBase",
        base: index === (teamIndex === 0 ? 5 : 2) ? null : 1,
        outNumber: index === (teamIndex === 0 ? 5 : 2) ? 3 : null
      }))
    };
    team.innings[2] = {
      outs: 0,
      runs: 0,
      complete: false,
      atBats: [{
        playerId: `${team.id}-${teamIndex === 0 ? 7 : 4}`,
        path: [1],
        advances: [{ from: 4, to: 1 }],
        status: "onBase",
        base: 1,
        outNumber: null
      }]
    };
  }
  const app = startApp(game);
  app.setInning(2);
  const currentInningProgress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.ok(currentInningProgress.classList.contains("inning-start"));

  app.elements.get("view-scorecard").click();
  const canvas = app.elements.get("scorecard-preview-content").children[0];
  const strokes = canvas.context.strokes.filter(stroke => stroke.lineWidth === 4);
  const teamTop = 140 + 62;
  const awayInningOneX = 44 + 45 + 205 + 48;
  const awayInningTwoX = 44 + 45 + 205 + 48 + 76;
  const panelWidth = 45 + 205 + 48 + 76 * 12;
  const homeInningOneX = 44 + panelWidth + 34 + 45 + 205 + 48;
  const homeInningTwoX = 44 + panelWidth + 34 + 45 + 205 + 48 + 76;
  const lineForRow = (x, row) => [[x, teamTop + row * 78], [x + 76, teamTop + row * 78]];
  const crossover = (previousX, starterRow) => [
    [previousX, teamTop + (starterRow + 1) * 78],
    [previousX + 76, teamTop + starterRow * 78]
  ];

  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify(lineForRow(awayInningTwoX, 3))));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify(lineForRow(homeInningTwoX, 6))));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify(crossover(awayInningOneX, 3))));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify(crossover(homeInningOneX, 6))));
  assert.equal(strokes.length, 4, "each team has one diagonal crossover and one next-inning top line");
});

test("the next-inning marker remains on the actual starter when the batting order wraps", () => {
  const game = createGame();
  for (const team of game.teams) {
    team.players.push(
      { id: `${team.id}-4`, name: "Player 4", order: 4 },
      { id: `${team.id}-5`, name: "Player 5", order: 5 },
      { id: `${team.id}-6`, name: "Player 6", order: 6 },
      { id: `${team.id}-7`, name: "Player 7", order: 7 }
    );
    team.innings[1] = {
      outs: 3,
      runs: 1,
      complete: false,
      atBats: team.players.map((player, index) => ({
        playerId: player.id,
        path: [],
        status: index === 0 ? "run" : index >= 4 ? "out" : "onBase",
        base: index > 0 && index < 4 ? 1 : null,
        outNumber: index >= 4 ? index - 3 : null
      }))
    };
    team.innings[2] = {
      outs: 0,
      runs: 0,
      complete: false,
      atBats: [{
        playerId: `${team.id}-1`,
        path: [1],
        advances: [{ from: 4, to: 1 }],
        status: "onBase",
        base: 1,
        outNumber: null
      }]
    };
  }
  const app = startApp(game);
  app.setInning(2);
  const currentInningProgress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.ok(currentInningProgress.classList.contains("inning-start"));

  app.elements.get("view-scorecard").click();
  const canvas = app.elements.get("scorecard-preview-content").children[0];
  const strokes = canvas.context.strokes.filter(stroke => stroke.lineWidth === 4);
  const crossedCellTop = 140 + 62;
  const homeTeamX = 44 + 45 + 205 + 48 + 76 * 12 + 34;
  const inningOneX = homeTeamX + 45 + 205 + 48;
  const inningTwoX = inningOneX + 76;
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [inningTwoX, crossedCellTop],
    [inningTwoX + 76, crossedCellTop]
  ])));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [inningOneX, crossedCellTop + 78],
    [inningOneX + 76, crossedCellTop]
  ])));
  assert.equal(strokes.length, 4, "wrapped lineups still get one diagonal and top line for each team");
});

test("automatic runs show a green notice without confirmation", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.moveNextBatterTo(4);

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 2);
  assert.equal(app.elements.get("scoring-message").textContent, "Player 1, Player 2 moved home and scored.");
  assert.ok(app.elements.get("scoring-message").classList.contains("success"));
});

test("moving an occupied-base runner directly home does not confirm", () => {
  const app = startApp();
  app.moveNextBatterTo(1);

  app.clickBase(1);
  app.clickBase(4);

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 1);
});

test("clicking an occupied base selects its runner instead of moving the selected player there", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.selectPlayer(1);
  app.clickBase(1);

  assert.equal(app.currentGame().teams[0].innings[1].atBats.length, 1);
  assert.equal(app.elements.get("selected-player").textContent, "Selected: Player 1");
});

test("automatically advancing runners home records runs without confirmation", () => {
  const app = startApp();
  app.moveNextBatterTo(3);
  app.moveNextBatterTo(1);
  app.selectPlayer(2);
  app.chooseMove("Third");

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 2);
  assert.equal(app.currentGame().teams[0].innings[1].atBats[0].status, "run");
  assert.equal(app.currentGame().teams[0].innings[1].atBats[1].status, "run");
});

test("the diamond out control still records an out and the footer control is removed", () => {
  const app = startApp();
  app.elements.get("diamond-out").click();

  assert.equal(app.currentGame().teams[0].innings[1].outs, 1);
  assert.equal(app.currentGame().teams[0].innings[1].atBats[0].status, "out");
  assert.equal(app.elements.has("record-out"), false);
});

test("configured hitter limit warns in red but allows more players to bat", () => {
  const game = createGame();
  game.playersPerInning = 2;
  const app = startApp(game);
  app.moveNextBatterTo(1);
  app.moveNextBatterTo(2);
  assert.ok(app.elements.get("inning-alert").classList.contains("warning"));
  assert.ok(app.elements.get("inning-alert").textContent.includes("The inning should be ending, but you can continue scoring if needed"));
  app.moveNextBatterTo(1);

  assert.equal(app.currentGame().teams[0].innings[1].atBats.length, 3);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 0);
});

test("skipping the next player advances the lineup without recording an out", () => {
  const app = startApp();
  app.elements.get("diamond-next-player").click();
  app.chooseMove("Skip player");

  const half = app.currentGame().teams[0].innings[1];
  assert.equal(half.atBats[0].status, "skipped");
  assert.equal(half.outs, 0);
  assert.equal(app.elements.get("diamond-next-player").textContent, "Next up: Player 2");
  assert.equal(app.elements.get("inning-scorecard").children[0].children[4].children[0].textContent, "Skipped");
});

test("a skipped player can return after the lineup is complete without creating a second scorecard entry", () => {
  const app = startApp();
  app.elements.get("diamond-next-player").click();
  app.chooseMove("Skip player");
  app.moveNextBatterTo(4);
  app.moveNextBatterTo(4);

  app.selectPlayer(0);
  app.chooseMove("Second");

  const half = app.currentGame().teams[0].innings[1];
  assert.equal(half.atBats.length, 3);
  assert.equal(half.atBats[0].playerId, "home-1");
  assert.equal(half.atBats[0].status, "onBase");
  assert.equal(half.atBats[0].base, 2);
  assert.equal(half.runs, 2);
});

test("players can be renamed and added during a game without changing score identity", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  const playerName = app.elements.get("lineup-list").children[0].children[1];
  playerName.value = "Renamed player";
  app.change(playerName);

  const addName = app.elements.get("new-player-name");
  addName.value = "New player";
  app.elements.get("add-player").click();

  const team = app.currentGame().teams[0];
  assert.equal(team.players[0].name, "Renamed player");
  assert.equal(team.players[0].id, "home-1");
  assert.equal(team.innings[1].atBats[0].playerId, "home-1");
  assert.equal(team.players[3].name, "New player");
  assert.equal(team.players[3].order, 4);
  assert.equal(app.elements.get("inning-scorecard").children[0].children[2].textContent, "Renamed player");
});

test("setup rosters can be edited, removed, added, and reordered before saving", () => {
  const app = startApp(null);
  app.elements.get("add-home-player").click();
  const firstName = app.elements.get("home-roster").children[0].children[0];
  firstName.value = "First";
  app.change(firstName);
  app.elements.get("add-home-player").click();
  const secondName = app.elements.get("home-roster").children[1].children[0];
  secondName.value = "Second";
  app.change(secondName);
  app.elements.get("home-roster").children[0].children[2].click();

  app.elements.get("add-away-player").click();
  const awayName = app.elements.get("away-roster").children[0].children[0];
  awayName.value = "Away player";
  app.change(awayName);
  app.elements.get("home-name").value = "Home";
  app.elements.get("away-name").value = "Away";
  app.elements.get("game-name").value = "";
  app.elements.get("game-date").value = "";
  app.elements.get("game-ground").value = "";
  app.elements.get("start-game").click();

  assert.deepEqual(app.currentGame().teams[0].players.map(player => player.name), ["Second", "First"]);
  assert.deepEqual(app.currentGame().teams[1].players.map(player => player.name), ["Away player"]);
});

test("selecting a static team loads its player list, while New team clears the roster for custom setup", () => {
  const app = startApp(null, false, [
    { id: "tigers", name: "Tigers", players: ["Alex", "Bailey"] }
  ]);
  const choice = app.elements.get("home-team-choice");
  choice.value = "tigers";
  app.change(choice);

  assert.equal(app.elements.get("home-name").value, "Tigers");
  assert.deepEqual(app.elements.get("home-roster").children.map(item => item.children[0].value), ["Alex", "Bailey"]);

  choice.value = "";
  app.change(choice);
  assert.equal(app.elements.get("home-name").value, "");
  assert.equal(app.elements.get("home-roster").children.length, 0);
  assert.equal(app.elements.get("home-team-choice").children[0].textContent, "New team");
});

test("the static team list loads before the app script", () => {
  assert.ok(html.indexOf('src="teams.js"') < html.indexOf('src="app.js"'));
});

test("scorecard edit selections do not change scores until explicitly saved", () => {
  const app = startApp();
  app.elements.get("diamond-out").click();
  app.moveNextBatterTo(1);
  const rows = app.elements.get("inning-scorecard").children;
  const firstCheckbox = rows[0].children[0].children[0];
  const secondCheckbox = rows[1].children[0].children[0];
  firstCheckbox.checked = true;
  secondCheckbox.checked = true;
  app.change(firstCheckbox);
  app.change(secondCheckbox);
  app.elements.get("scorecard-home").click();

  const unchanged = app.currentGame().teams[0].innings[1];
  assert.equal(unchanged.runs, 0);
  assert.equal(unchanged.outs, 1);
  assert.equal(app.elements.get("scorecard-route-preview").textContent, "Home run");

  app.elements.get("save-scorecard-edit").click();
  const half = app.currentGame().teams[0].innings[1];
  assert.equal(half.runs, 2);
  assert.equal(half.outs, 0);
  assert.ok(app.elements.get("inning-scorecard").children.every(row =>
    row.children[3].children[0].classList.contains("scored")
  ));
  assert.equal(app.elements.get("scorecard-edit-actions").hidden, true);
});

test("scorecard editing records an ordered first-to-third route when saved", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  const checkbox = app.elements.get("inning-scorecard").children[0].children[0].children[0];
  checkbox.checked = true;
  app.change(checkbox);
  app.elements.get("scorecard-base-1").click();
  app.elements.get("scorecard-base-3").click();
  assert.equal(app.elements.get("scorecard-route-preview").textContent, "Base 1 → Base 3");
  app.elements.get("save-scorecard-edit").click();

  const atBat = app.currentGame().teams[0].innings[1].atBats[0];
  assert.equal(atBat.status, "onBase");
  assert.equal(atBat.base, 3);
  assert.deepEqual(atBat.path, [1, 3]);
  assert.deepEqual(atBat.advances, [{ from: 4, to: 1 }, { from: 1, to: 3 }]);
  const progress = app.elements.get("inning-scorecard").children[0].children[3].children[0];
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => child.dataset.base), ["1", "2", "3"]);
});

test("Home alone records a home run, while first base followed by Out preserves the reached base", () => {
  const homeRunApp = startApp();
  homeRunApp.moveNextBatterTo(1);
  let checkbox = homeRunApp.elements.get("inning-scorecard").children[0].children[0].children[0];
  checkbox.checked = true;
  homeRunApp.change(checkbox);
  homeRunApp.elements.get("scorecard-home").click();
  homeRunApp.elements.get("save-scorecard-edit").click();
  let atBat = homeRunApp.currentGame().teams[0].innings[1].atBats[0];
  assert.equal(atBat.status, "run");
  assert.deepEqual(atBat.path, [1, 2, 3, 4]);
  assert.deepEqual(atBat.advances, [
    { from: 4, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 }
  ]);
  assert.equal(homeRunApp.currentGame().teams[0].innings[1].runs, 1);

  const outApp = startApp();
  outApp.moveNextBatterTo(1);
  checkbox = outApp.elements.get("inning-scorecard").children[0].children[0].children[0];
  checkbox.checked = true;
  outApp.change(checkbox);
  outApp.elements.get("scorecard-base-1").click();
  outApp.elements.get("scorecard-out").click();
  assert.equal(outApp.elements.get("scorecard-route-preview").textContent, "Base 1 → Out");
  outApp.elements.get("save-scorecard-edit").click();
  atBat = outApp.currentGame().teams[0].innings[1].atBats[0];
  assert.equal(atBat.status, "out");
  assert.equal(atBat.outNumber, 1);
  assert.deepEqual(atBat.path, [1]);
  assert.deepEqual(atBat.advances, [{ from: 4, to: 1 }]);
  assert.equal(outApp.currentGame().teams[0].innings[1].outs, 1);
});

test("ending both half-innings advances to the next inning and resets to the first team", () => {
  const app = startApp();
  assert.equal(app.elements.get("end-inning").textContent, "End Home inning → Start Away inning 1");
  app.elements.get("end-inning").click();
  assert.equal(app.elements.get("batting-team").value, "away");
  assert.equal(app.elements.get("inning-select").value, "1");
  assert.equal(app.elements.get("end-inning").textContent, "End Away inning → Start Home inning 2");
  app.elements.get("end-inning").click();
  assert.equal(app.elements.get("batting-team").value, "home");
  assert.equal(app.elements.get("inning-select").value, "2");
  assert.equal(app.currentGame().teams[0].innings[1].ended, true);
  assert.equal(app.currentGame().teams[1].innings[1].ended, true);
});

test("the inning button names its next team and identifies the end of the final inning", () => {
  const game = createGame();
  game.teams[0].name = "Red Sox";
  game.teams[1].name = "Heatwaves";
  const app = startApp(game);
  assert.equal(app.elements.get("end-inning").textContent, "End Red Sox inning → Start Heatwaves inning 1");
  app.setInning(2);
  assert.equal(app.elements.get("end-inning").textContent, "End Red Sox inning → Start Heatwaves inning 2");
  app.elements.get("end-inning").click();
  assert.equal(app.elements.get("end-inning").textContent, "End Heatwaves inning · Finish game");
  app.elements.get("end-inning").click();
  assert.equal(app.elements.get("end-inning").textContent, "Inning ended · Game complete");
});

test("ending both team innings draws the diagonal and top line for the next batter", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.elements.get("end-inning").click();
  app.elements.get("end-inning").click();
  app.moveNextBatterTo(2);
  app.elements.get("view-scorecard").click();

  const canvas = app.elements.get("scorecard-preview-content").children[0];
  const strokes = canvas.context.strokes.filter(stroke => stroke.lineWidth === 4);
  const nextInningRowTop = 140 + 62 + 78;
  const homeInningOneX = 44 + 45 + 205 + 48 + 76 * 12 + 34 + 45 + 205 + 48;
  const homeTeamX = 44 + 45 + 205 + 48 + 76 * 12 + 34;
  const inningTwoX = homeTeamX + 45 + 205 + 48 + 76;
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [inningTwoX, nextInningRowTop],
    [inningTwoX + 76, nextInningRowTop]
  ])));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [homeInningOneX, nextInningRowTop + 78],
    [homeInningOneX + 76, nextInningRowTop]
  ])));
  assert.equal(strokes.length, 4, "one diagonal and one top line per team");
});

test("warnings sit above the diamond and scorecard run/out circles use green/red", () => {
  const warningPosition = html.indexOf('id="inning-alert"');
  const diamondPanelPosition = html.indexOf('class="panel diamond-panel"');
  const diamondPosition = html.indexOf('<div class="diamond-wrap">');
  assert.ok(warningPosition > diamondPanelPosition && warningPosition < diamondPosition);
  assert.match(css, /\.inning-alert-row\s*\{[^}]*flex-direction:\s*column/i);
  assert.match(css, /\.inning-alert-row\s+\.inning-alert\s*\{[^}]*width:\s*100%/i);
  assert.match(css, /\.inning-alert-row\s+#end-inning\s*\{[^}]*align-self:\s*flex-end/i);
  assert.match(css, /\.progress-dots\.scored::after\s*\{[^}]*background:\s*#25834a/i);
  assert.match(css, /\.progress-dots\[data-out\]::after\s*\{[^}]*background:\s*#bf4038/i);
});

test("reaching the configured out count warns that the inning should end but does not block scoring", () => {
  const game = createGame();
  for (const team of game.teams) {
    team.players.push(
      { id: `${team.id}-4`, name: "Player 4", order: 4 },
      { id: `${team.id}-5`, name: "Player 5", order: 5 }
    );
  }
  const app = startApp(game);
  app.elements.get("diamond-out").click();
  app.elements.get("diamond-out").click();
  app.elements.get("diamond-out").click();
  assert.ok(app.elements.get("inning-alert").classList.contains("warning"));
  assert.match(app.elements.get("inning-alert").textContent, /the inning should be ending/i);
  assert.match(app.elements.get("inning-alert").textContent, /but you can continue scoring if needed/i);
  app.moveNextBatterTo(1);
  assert.equal(app.currentGame().teams[0].innings[1].atBats.length, 4);
  assert.equal(app.currentGame().teams[0].innings[1].outs, 3);
});

test("a custom out count controls the inning warning", () => {
  const game = createGame();
  game.outsPerInning = 2;
  const app = startApp(game);
  app.elements.get("diamond-out").click();
  assert.doesNotMatch(app.elements.get("inning-alert").textContent, /inning should end/i);
  app.elements.get("diamond-out").click();
  assert.match(app.elements.get("inning-alert").textContent, /2 outs recorded\. The inning should be ending/i);
});

test("a scoring notice remains visible when the final player completes the lineup", () => {
  const game = createGame();
  game.playersPerInning = 3;
  const app = startApp(game);
  app.moveNextBatterTo(1);
  app.moveNextBatterTo(2);
  app.moveNextBatterTo(4);

  assert.equal(app.elements.get("scoring-message").textContent, "Player 1, Player 2, Player 3 moved home and scored.");
  assert.ok(app.elements.get("scoring-message").classList.contains("success"));
  assert.equal(app.elements.get("diamond-next-player").disabled, true);
});

test("earlier innings remain editable after scoring has started in a later inning", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.setInning(2);
  app.moveNextBatterTo(1);

  app.setInning(1);
  app.selectPlayer(0);
  app.chooseMove("Second");

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].atBats[0].base, 2);
  assert.equal(app.currentGame().teams[0].innings[2].atBats[0].playerId, "home-2");
});

test("mobile game view starts with setup and batting order collapsed", () => {
  const app = startApp(createGame(), true);

  assert.equal(app.elements.get("setup-content").hidden, true);
  assert.equal(app.elements.get("lineup-content").hidden, true);
  app.elements.get("toggle-setup").click();
  app.elements.get("toggle-lineup").click();
  assert.equal(app.elements.get("setup-content").hidden, false);
  assert.equal(app.elements.get("lineup-content").hidden, false);
});

test("mobile setup and batting order stay expanded across viewport resizes until hidden", () => {
  const app = startApp(createGame(), true);

  app.elements.get("toggle-setup").click();
  app.elements.get("toggle-lineup").click();
  app.resizeTo(false);
  app.resizeTo(true);

  assert.equal(app.elements.get("setup-content").hidden, false);
  assert.equal(app.elements.get("lineup-content").hidden, false);

  app.elements.get("toggle-setup").click();
  app.elements.get("toggle-lineup").click();
  app.resizeTo(false);
  app.resizeTo(true);

  assert.equal(app.elements.get("setup-content").hidden, true);
  assert.equal(app.elements.get("lineup-content").hidden, true);
});

test("manual and contextual info buttons work without native dialog support", () => {
  const app = startApp();
  const manual = app.elements.get("user-manual");
  const infoDialog = app.elements.get("info-dialog");

  app.elements.get("open-manual").click();
  assert.equal(manual.open, true);
  assert.ok(manual.classList.contains("dialog-fallback"));

  app.elements.get("close-manual").click();
  assert.equal(manual.open, false);

  let prevented = false;
  for (const listener of app.infoButton.listeners.get("click") || []) listener({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(manual.open, false);
  assert.equal(infoDialog.open, true);
  assert.equal(app.elements.get("info-dialog-title").textContent, "scoring");
  assert.equal(app.elements.get("info-dialog-message").textContent, "Context help text.");
});

test("replacing a saved game uses a yes-or-no dialog and cancellation keeps the game", () => {
  const cancelled = startApp();
  const originalName = cancelled.currentGame().name;
  cancelled.elements.get("game-name").value = "Replacement game";
  cancelled.elements.get("start-game").click();

  const confirmDialog = cancelled.elements.get("confirm-dialog");
  assert.equal(confirmDialog.open, true);
  assert.equal(cancelled.elements.get("confirm-dialog-title").textContent, "Replace saved game?");
  assert.match(html, /id="cancel-confirm"[^>]*>No, cancel<\/button>/);
  assert.equal(cancelled.elements.get("accept-confirm").textContent, "Yes, replace game");
  cancelled.elements.get("cancel-confirm").click();
  assert.equal(confirmDialog.open, false);
  assert.equal(cancelled.currentGame().name, originalName);

  const accepted = startApp();
  accepted.elements.get("game-name").value = "Replacement game";
  accepted.elements.get("start-game").click();
  accepted.elements.get("accept-confirm").click();
  assert.equal(accepted.currentGame().name, "Replacement game");
});

test("new game defaults include 3 outs, and inning settings must be positive integers", () => {
  const app = startApp(null);
  assert.equal(app.elements.get("innings-count").value, "12");
  assert.equal(app.elements.get("players-per-inning").value, "9");
  assert.equal(app.elements.get("outs-per-inning").value, "3");

  for (const id of ["home-lineup", "away-lineup"]) app.elements.get(id).value = "Player One";
  app.elements.get("home-name").value = "Home";
  app.elements.get("away-name").value = "Away";
  app.elements.get("innings-count").value = "13";
  app.elements.get("start-game").click();
  assert.equal(app.alerts[0], "Choose between 1 and 12 innings.");

  app.elements.get("innings-count").value = "12";
  app.elements.get("players-per-inning").value = "1.5";
  app.elements.get("start-game").click();

  assert.equal(app.alerts[1], "Enter a positive whole number of hitters per inning.");

  app.elements.get("players-per-inning").value = "9";
  app.elements.get("outs-per-inning").value = "0";
  app.elements.get("start-game").click();
  assert.equal(app.alerts[2], "Enter a positive whole number of outs per inning.");
});
