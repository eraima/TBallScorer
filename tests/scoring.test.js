"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
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

function startApp(savedGame = createGame(), mobile = false) {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const infoButton = new FakeElement("info-button");
  infoButton.dataset.help = "Context help text.";
  infoButton.setAttribute("aria-label", "More information about scoring");
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
      return selector === ".info-button" ? [infoButton] : [];
    },
    createElement(tagName) {
      const element = new FakeElement();
      if (tagName === "canvas") element.toDataURL = () => "";
      return element;
    },
    body: new FakeElement("body")
  };
  const context = {
    document,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    window: {
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

  function setInning(number) {
    const select = elements.get("inning-select");
    select.value = String(number);
    for (const listener of select.listeners.get("change") || []) listener();
  }

  function currentGame() {
    return JSON.parse(storage.get("tball-scorebook-game-v1"));
  }

  return { elements, infoButton, confirmations, alerts, clickBase, moveNextBatterTo, selectPlayer, chooseMove, setInning, currentGame };
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
  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
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
  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
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
  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
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

  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
  assert.equal(progress.children.filter(child => child.className === "base-dot").length, 2);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 0);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow").length, 0);
});

test("a home run shows four linked dots and an arrow at home", () => {
  const app = startApp();
  app.moveNextBatterTo(4);

  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
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

  const progress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
  assert.deepEqual(progress.children.filter(child => child.className === "base-dot").map(child => Number(child.dataset.base)).sort(), [1, 2, 3, 4]);
  assert.equal(progress.children.filter(child => child.className === "dot-connection").length, 3);
  assert.deepEqual(progress.children.filter(child => child.className === "dot-connection").map(child => child.style.left), ["86%", "50%", "14%"]);
  assert.equal(progress.children.filter(child => child.className === "dot-arrow")[0].style.left, "50%");
});

test("inning transitions cross the next batter's previous cell and mark their next start", () => {
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
      runs: 0,
      complete: false,
      atBats: team.players.slice(0, 6).map((player, index) => ({
        playerId: player.id,
        path: [],
        status: index === 5 ? "out" : "onBase",
        base: index === 5 ? null : 1,
        outNumber: index === 5 ? 3 : null
      }))
    };
    team.innings[2] = {
      outs: 0,
      runs: 0,
      complete: false,
      atBats: [{
        playerId: `${team.id}-7`,
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
  const currentInningProgress = app.elements.get("inning-scorecard").children[0].children[2].children[0];
  assert.ok(currentInningProgress.classList.contains("inning-start"));

  app.elements.get("view-scorecard").click();
  const canvas = app.elements.get("scorecard-preview-content").children[0];
  const strokes = canvas.context.strokes.filter(stroke => stroke.lineWidth === 4);
  const crossedCellTop = 140 + 62 + 6 * 78;
  const homeTeamX = 44 + 45 + 205 + 48 + 76 * 12 + 34;
  const inningOneX = homeTeamX + 45 + 205 + 48;
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [inningOneX, crossedCellTop + 78],
    [inningOneX + 76, crossedCellTop]
  ])));
  assert.ok(strokes.some(({ path }) => JSON.stringify(path) === JSON.stringify([
    [inningOneX + 76, crossedCellTop],
    [inningOneX + 152, crossedCellTop]
  ])));
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
  assert.ok(app.elements.get("inning-alert").textContent.includes("You can keep scoring"));
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
  assert.equal(app.elements.get("inning-scorecard").children[0].children[3].children[0].textContent, "Skipped");
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
  assert.match(app.elements.get("inning-alert").textContent, /the inning should end/i);
  assert.doesNotMatch(app.elements.get("inning-alert").textContent, /You can keep scoring/);
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
  assert.match(app.elements.get("inning-alert").textContent, /2 outs recorded; the inning should end/i);
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
