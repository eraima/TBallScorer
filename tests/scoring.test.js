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
    this.classList = {
      add: name => this.toggleClass(name, true),
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
  }

  append(...elements) {
    this.children.push(...elements);
  }

  replaceChildren(...elements) {
    this.children = [...elements];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
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
    inningRule: "three-outs",
    teams
  };
}

function startApp() {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  const bases = [1, 2, 3, 4].map(base => {
    const button = new FakeElement();
    button.dataset.base = String(base);
    return button;
  });
  elements.get("diamond").bases = bases;
  const savedGame = createGame();
  const storage = new Map([["tball-scorebook-game-v1", JSON.stringify(savedGame)]]);
  const confirmations = [];
  const document = {
    querySelector(selector) {
      return elements.get(selector.slice(1)) || null;
    },
    createElement() {
      return new FakeElement();
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
      alert() {},
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

  function currentGame() {
    return JSON.parse(storage.get("tball-scorebook-game-v1"));
  }

  return { elements, confirmations, clickBase, moveNextBatterTo, selectPlayer, chooseMove, currentGame };
}

test("moving a batter directly home records a run without confirmation", () => {
  const app = startApp();

  app.moveNextBatterTo(4);

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 1);
  assert.equal(app.currentGame().teams[0].innings[1].atBats[0].status, "run");
});

test("moving a batter home confirms only the runners automatically scored", () => {
  const app = startApp();
  app.moveNextBatterTo(1);
  app.moveNextBatterTo(4);

  assert.deepEqual(app.confirmations, ["Confirm that Player 1 reached home?"]);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 2);
});

test("moving an occupied-base runner directly home does not confirm", () => {
  const app = startApp();
  app.moveNextBatterTo(1);

  app.clickBase(1);
  app.clickBase(4);

  assert.deepEqual(app.confirmations, []);
  assert.equal(app.currentGame().teams[0].innings[1].runs, 1);
});

test("automatically advancing a runner home asks for confirmation", () => {
  const app = startApp();
  app.moveNextBatterTo(3);
  app.moveNextBatterTo(1);
  app.selectPlayer(2);
  app.chooseMove("Third");

  assert.deepEqual(app.confirmations, ["Confirm that Player 1, Player 2 reached home?"]);
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
