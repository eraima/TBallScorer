"use strict";

const STORAGE_KEY = "tball-scorebook-game-v1";
const BASE_NAMES = { 1: "First", 2: "Second", 3: "Third", 4: "Home" };
const els = {
  saveState: document.querySelector("#save-state"),
  setupContent: document.querySelector("#setup-content"),
  toggleSetup: document.querySelector("#toggle-setup"),
  gameName: document.querySelector("#game-name"),
  gameDate: document.querySelector("#game-date"),
  gameGround: document.querySelector("#game-ground"),
  inningsCount: document.querySelector("#innings-count"),
  inningRule: document.querySelector("#inning-rule"),
  homeName: document.querySelector("#home-name"),
  awayName: document.querySelector("#away-name"),
  homeLineup: document.querySelector("#home-lineup"),
  awayLineup: document.querySelector("#away-lineup"),
  startGame: document.querySelector("#start-game"),
  gameArea: document.querySelector("#game-area"),
  scoreboardTitle: document.querySelector("#scoreboard-title"),
  scoreboardTeams: document.querySelector("#scoreboard-teams"),
  battingTeam: document.querySelector("#batting-team"),
  inningSelect: document.querySelector("#inning-select"),
  inningSummary: document.querySelector("#inning-summary"),
  inningAlert: document.querySelector("#inning-alert"),
  lineupTitle: document.querySelector("#lineup-title"),
  lineupList: document.querySelector("#lineup-list"),
  nextBatterBadge: document.querySelector("#next-batter-badge"),
  selectedPlayer: document.querySelector("#selected-player"),
  diamond: document.querySelector("#diamond"),
  diamondOut: document.querySelector("#diamond-out"),
  baseOccupancy: document.querySelector("#base-occupancy"),
  playerMoveOptions: document.querySelector("#player-move-options"),
  scoringMessage: document.querySelector("#scoring-message"),
  undoLastAction: document.querySelector("#undo-last-action"),
  redoAction: document.querySelector("#redo-action"),
  scorecardTeamLabel: document.querySelector("#scorecard-team-label"),
  inningScorecard: document.querySelector("#inning-scorecard"),
  viewScorecard: document.querySelector("#view-scorecard"),
  scorecardPreview: document.querySelector("#scorecard-preview"),
  scorecardPreviewContent: document.querySelector("#scorecard-preview-content"),
  closeScorecardPreview: document.querySelector("#close-scorecard-preview"),
  exportJson: document.querySelector("#export-json"),
  exportImage: document.querySelector("#export-image")
};

let game = loadGame();
let selectedPlayerId = null;
let setupCollapsed = false;

function makeId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadGame() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.teams) || parsed.teams.length !== 2) {
      throw new Error("The saved game has an unsupported format.");
    }
    return parsed;
  } catch (error) {
    console.error("Could not load the saved game:", error);
    els.saveState.textContent = "Saved game could not be loaded";
    return null;
  }
}

function persistGame() {
  if (!game) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    els.saveState.textContent = "Saved on this device";
  } catch (error) {
    console.error("Could not save the game:", error);
    els.saveState.textContent = "Save failed — export your game";
  }
}

function currentTeam() {
  return game?.teams.find(team => team.id === els.battingTeam.value) ?? game?.teams[0] ?? null;
}

function currentInning() {
  return Number(els.inningSelect.value) || 1;
}

function getHalf(team, inning) {
  team.innings ??= {};
  team.innings[inning] ??= { atBats: [], outs: 0, runs: 0, complete: false };
  return team.innings[inning];
}

function allAtBats(team) {
  return Object.values(team.innings ?? {}).flatMap(half => half.atBats ?? []);
}

function getAtBat(team, inning, playerId) {
  return getHalf(team, inning).atBats.find(atBat => atBat.playerId === playerId);
}

function getOccupied(team, inning) {
  const occupied = new Map();
  for (const atBat of getHalf(team, inning).atBats) {
    if (atBat.status === "onBase" && atBat.base) occupied.set(atBat.base, atBat.playerId);
  }
  return occupied;
}

function saveUndoPoint() {
  game.undoHistory ??= [];
  game.undoHistory.push(JSON.stringify(game.teams));
  if (game.undoHistory.length > 100) game.undoHistory.shift();
  game.redoHistory = [];
}

function undoLastAction() {
  if (!game?.undoHistory?.length) return;
  game.redoHistory ??= [];
  game.redoHistory.push(JSON.stringify(game.teams));
  game.teams = JSON.parse(game.undoHistory.pop());
  selectedPlayerId = null;
  persistGame();
  render();
}

function redoAction() {
  if (!game?.redoHistory?.length) return;
  game.undoHistory ??= [];
  game.undoHistory.push(JSON.stringify(game.teams));
  game.teams = JSON.parse(game.redoHistory.pop());
  selectedPlayerId = null;
  persistGame();
  render();
}

function nextBatter(team, half = getHalf(team, currentInning())) {
  const played = new Set(half.atBats.map(atBat => atBat.playerId));
  for (let offset = 0; offset < team.players.length; offset += 1) {
    const index = (team.nextBatterIndex + offset) % team.players.length;
    const player = team.players[index];
    if (player && !played.has(player.id)) return player;
  }
  return null;
}

function getPlayer(team, playerId) {
  return team.players.find(player => player.id === playerId);
}

function getRunnerBase(team, inning, playerId) {
  const atBat = getAtBat(team, inning, playerId);
  return atBat?.status === "onBase" ? atBat.base : null;
}

function isHalfComplete(team, inning) {
  const half = getHalf(team, inning);
  if (game.inningRule === "three-outs") return half.outs >= 3;
  return half.atBats.length >= team.players.length;
}

function inningCompletionMessage(team, half) {
  if (game.inningRule === "three-outs" && half.outs >= 3) {
    return "Inning complete: all 3 outs have been recorded. Choose another inning to keep scoring.";
  }
  if (game.inningRule === "all-batters" && half.atBats.length >= team.players.length) {
    return `Inning complete: ${lineupLimitMessage(team)}`;
  }
  return "";
}

function lineupLimitMessage(team) {
  const message = team.players.length === 1
    ? "The only player has batted this inning."
    : `All ${team.players.length} players have batted this inning.`;
  return `${message} Choose another inning to keep scoring.`;
}

function showScoringMessage(message) {
  els.scoringMessage.textContent = message;
  els.scoringMessage.hidden = !message;
}

function parseLineup(text) {
  return text.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}

function createTeam(id, name, names) {
  return {
    id,
    name: name.trim(),
    players: names.map((playerName, index) => ({ id: makeId(), name: playerName, order: index + 1 })),
    nextBatterIndex: 0,
    innings: {}
  };
}

function saveSetup() {
  const homePlayers = parseLineup(els.homeLineup.value);
  const awayPlayers = parseLineup(els.awayLineup.value);
  const innings = Number(els.inningsCount.value);
  if (!els.homeName.value.trim() || !els.awayName.value.trim()) {
    window.alert("Please enter a name for both teams.");
    return;
  }
  if (!homePlayers.length || !awayPlayers.length) {
    window.alert("Add at least one player to each team's batting lineup.");
    return;
  }
  if (!Number.isInteger(innings) || innings < 1 || innings > 12) {
    window.alert("Choose between 1 and 12 innings.");
    return;
  }
  if (homePlayers.length > 40 || awayPlayers.length > 40) {
    window.alert("Each lineup can have up to 40 players.");
    return;
  }

  const updatedTeams = [
    createTeam("home", els.homeName.value, homePlayers),
    createTeam("away", els.awayName.value, awayPlayers)
  ];
  if (game && !window.confirm("Save this setup as a new game? This replaces the game currently saved on this device.")) return;
  game = {
    version: 1,
    name: els.gameName.value.trim(),
    date: els.gameDate.value,
    ground: els.gameGround.value.trim(),
    innings,
    inningRule: els.inningRule.value,
    teams: updatedTeams
  };
  selectedPlayerId = null;
  els.battingTeam.value = game.teams[0].id;
  els.inningSelect.value = "1";
  persistGame();
  render();
}

function recordBase(playerId, destination) {
  const team = currentTeam();
  const inning = currentInning();
  if (!team) return;
  const half = getHalf(team, inning);
  if (isHalfComplete(team, inning)) {
    showScoringMessage(inningCompletionMessage(team, half));
    return;
  }
  const atBat = getAtBat(team, inning, playerId);
  const batter = getPlayer(team, playerId);
  if (!batter) return;

  if (!atBat) {
    const upcomingBatter = nextBatter(team, half);
    if (upcomingBatter?.id !== playerId) {
      showScoringMessage(upcomingBatter
        ? `The next batter is ${upcomingBatter.name}. Keep the lineup in order.`
        : lineupLimitMessage(team));
      return;
    }
    if (destination < 1 || destination > 4) {
      showScoringMessage("Choose a valid base for the batter.");
      return;
    }
    if (destination === 4) {
      const occupied = getOccupied(team, inning);
      const scoringNames = [...occupied.values()].map(runnerId => getPlayer(team, runnerId)?.name).filter(Boolean);
      if (scoringNames.length && !confirmScorers(scoringNames)) return;
      saveUndoPoint();
      for (const runnerId of occupied.values()) {
        const runner = getAtBat(team, inning, runnerId);
        if (!runner) continue;
        for (let base = runner.base + 1; base <= 4; base += 1) runner.path.push(base);
        runner.status = "run";
        runner.base = null;
      }
      half.atBats.push({ playerId, path: [1, 2, 3, 4], status: "run", base: null, outNumber: null });
      half.runs += occupied.size + 1;
    } else {
      const cascade = planRunnerCascade(team, inning, destination);
      if (cascade.scoring.length && !confirmScorers(cascade.scoring)) return;
      saveUndoPoint();
      applyRunnerCascade(team, inning, cascade.moves);
      half.atBats.push({
        playerId,
        path: Array.from({ length: destination }, (_, index) => index + 1),
        status: "onBase",
        base: destination,
        outNumber: null
      });
    }
    team.nextBatterIndex = (team.players.findIndex(player => player.id === playerId) + 1) % team.players.length;
  } else {
    if (atBat.status !== "onBase") {
      showScoringMessage(`${batter.name} has already completed their turn this inning.`);
      return;
    }
    if (destination <= atBat.base) {
      showScoringMessage("Choose a base ahead of the runner's current base.");
      return;
    }
    if (destination === 4) {
      saveUndoPoint();
      for (let base = atBat.base + 1; base <= 4; base += 1) atBat.path.push(base);
      atBat.status = "run";
      atBat.base = null;
      half.runs += 1;
    } else {
      const cascade = planRunnerCascade(team, inning, destination, playerId, atBat.base);
      if (cascade.scoring.length && !confirmScorers(cascade.scoring)) return;
      saveUndoPoint();
      applyRunnerCascade(team, inning, cascade.moves);
      for (let base = atBat.base + 1; base <= destination; base += 1) atBat.path.push(base);
      atBat.base = destination;
    }
  }
  selectedPlayerId = null;
  showScoringMessage("");
  updateCompletion(team, inning);
  persistGame();
  render();
}

function planRunnerCascade(team, inning, destination, movingPlayerId = null, movingFromBase = null) {
  const occupied = getOccupied(team, inning);
  const moves = [];
  const scoring = [];
  const moveRunnerTo = (runnerId, targetBase) => {
    const currentBase = [...occupied.entries()].find(([, id]) => id === runnerId)?.[0];
    if (currentBase === undefined) return;
    if (targetBase >= 4) {
      occupied.delete(currentBase);
      moves.push({ playerId: runnerId, destination: 4 });
      scoring.push(getPlayer(team, runnerId)?.name ?? "A runner");
      return;
    }
    const blockingRunner = occupied.get(targetBase);
    if (blockingRunner && blockingRunner !== runnerId) moveRunnerTo(blockingRunner, targetBase + 1);
    occupied.delete(currentBase);
    occupied.set(targetBase, runnerId);
    moves.push({ playerId: runnerId, destination: targetBase });
  };

  const blockingRunner = occupied.get(destination);
  if (blockingRunner && blockingRunner !== movingPlayerId) {
    moveRunnerTo(blockingRunner, destination + 1);
  }

  const firstForcedBase = movingFromBase === null ? 1 : movingFromBase + 1;
  for (let base = destination - 1; base >= firstForcedBase; base -= 1) {
    const runnerId = occupied.get(base);
    if (runnerId && runnerId !== movingPlayerId) moveRunnerTo(runnerId, destination + 1);
  }
  return { moves, scoring };
}

function confirmScorers(playerNames) {
  return window.confirm(`Confirm that ${playerNames.join(", ")} reached home?`);
}

function applyRunnerCascade(team, inning, moves) {
  const half = getHalf(team, inning);
  for (const move of moves) {
    const atBat = getAtBat(team, inning, move.playerId);
    if (!atBat) continue;
    for (let base = atBat.base + 1; base <= move.destination; base += 1) atBat.path.push(base);
    if (move.destination === 4) {
      atBat.status = "run";
      atBat.base = null;
      half.runs += 1;
    } else {
      atBat.base = move.destination;
    }
  }
}

function recordOut(playerId = selectedPlayerId || nextBatter(currentTeam())?.id) {
  const team = currentTeam();
  const inning = currentInning();
  if (!team) return;
  if (!playerId) {
    const half = getHalf(team, inning);
    showScoringMessage(half.atBats.length >= team.players.length
      ? lineupLimitMessage(team)
      : "There is no player available to record as out.");
    return;
  }
  const half = getHalf(team, inning);
  if (isHalfComplete(team, inning)) {
    showScoringMessage(inningCompletionMessage(team, half));
    return;
  }
  let atBat = getAtBat(team, inning, playerId);
  if (!atBat) {
    const batter = nextBatter(team, half);
    if (batter?.id !== playerId) {
      showScoringMessage(batter
        ? `The next batter is ${batter.name}. Keep the lineup in order.`
        : `All ${team.players.length} players have batted this inning. Choose another inning to keep scoring.`);
      return;
    }
    saveUndoPoint();
    atBat = { playerId, path: [], status: "out", base: null, outNumber: null };
    half.atBats.push(atBat);
    team.nextBatterIndex = (team.players.findIndex(player => player.id === playerId) + 1) % team.players.length;
  } else if (atBat.status !== "onBase") {
    showScoringMessage(`${getPlayer(team, playerId)?.name ?? "This player"} has already completed their turn this inning.`);
    return;
  } else {
    saveUndoPoint();
    atBat.status = "out";
    atBat.base = null;
  }
  half.outs += 1;
  atBat.outNumber = half.outs;
  selectedPlayerId = null;
  showScoringMessage("");
  updateCompletion(team, inning);
  persistGame();
  render();
}

function updateCompletion(team, inning) {
  const half = getHalf(team, inning);
  half.complete = isHalfComplete(team, inning);
}

function scoreTotals(team) {
  let total = 0;
  for (let inning = 1; inning <= game.innings; inning += 1) total += team.innings?.[inning]?.runs ?? 0;
  return total;
}

function renderScoreboard() {
  els.scoreboardTitle.textContent = game.name || "Game score";
  els.scoreboardTeams.replaceChildren();
  game.teams.forEach((team, index) => {
    const card = document.createElement("div");
    card.className = `team-score${index === 1 ? " away" : ""}`;
    const details = document.createElement("div");
    const name = document.createElement("div");
    name.className = "team-score-name";
    name.textContent = team.name;
    const runs = document.createElement("small");
    runs.textContent = "TOTAL RUNS";
    const value = document.createElement("div");
    value.className = "team-score-value";
    value.textContent = String(scoreTotals(team));
    details.append(name, runs);
    card.append(details, value);
    els.scoreboardTeams.append(card);
  });
}

function renderTeamAndInningsOptions() {
  const selectedTeam = els.battingTeam.value || game.teams[0].id;
  const selectedInning = Number(els.inningSelect.value) || 1;
  els.battingTeam.replaceChildren();
  game.teams.forEach(team => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    els.battingTeam.append(option);
  });
  els.battingTeam.value = game.teams.some(team => team.id === selectedTeam) ? selectedTeam : game.teams[0].id;
  els.inningSelect.replaceChildren();
  for (let number = 1; number <= game.innings; number += 1) {
    const option = document.createElement("option");
    option.value = String(number);
    option.textContent = `Inning ${number}`;
    els.inningSelect.append(option);
  }
  els.inningSelect.value = String(Math.min(selectedInning, game.innings));
}

function renderLineup(team, inning) {
  const half = getHalf(team, inning);
  const batter = nextBatter(team, half);
  els.lineupTitle.textContent = `${team.name} lineup`;
  els.nextBatterBadge.textContent = batter ? `Up next: ${batter.name}` : "Lineup complete";
  els.lineupList.replaceChildren();
  if (!team.players.length) {
    const empty = document.createElement("li");
    empty.className = "empty-lineup";
    empty.textContent = "No players in this lineup.";
    els.lineupList.append(empty);
    return;
  }
  const byPlayer = new Map(half.atBats.map(atBat => [atBat.playerId, atBat]));
  team.players.forEach(player => {
    const atBat = byPlayer.get(player.id);
    const li = document.createElement("li");
    li.className = "player-card";
    if (selectedPlayerId === player.id) li.classList.add("selected");
    if (atBat?.status === "onBase") li.classList.add("on-base");
    if (atBat && atBat.status !== "onBase") li.classList.add("played");
    li.dataset.playerId = player.id;
    li.setAttribute("role", "button");
    li.setAttribute("tabindex", "0");
    li.setAttribute("aria-label", playerStatusLabel(player, atBat, batter));
    li.addEventListener("click", () => selectPlayer(player.id));
    li.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPlayer(player.id);
      }
    });
    const order = document.createElement("span");
    order.className = "player-number";
    order.textContent = String(player.order);
    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = player.name;
    const status = document.createElement("span");
    status.className = "player-status";
    status.textContent = atBat ? (atBat.status === "onBase" ? `${BASE_NAMES[atBat.base]} base` : atBat.status === "run" ? "Run" : `Out ${atBat.outNumber}`) : (player.id === batter?.id ? "UP" : "");
    li.append(order, name, status);
    els.lineupList.append(li);
  });
}

function playerStatusLabel(player, atBat, batter) {
  if (atBat?.status === "onBase") return `${player.name}, on ${BASE_NAMES[atBat.base]} base. Select to move runner.`;
  if (atBat?.status === "run") return `${player.name}, scored a run.`;
  if (atBat?.status === "out") return `${player.name}, out ${atBat.outNumber}.`;
  return player.id === batter?.id ? `${player.name}, next batter.` : `${player.name}, waiting in lineup.`;
}

function selectPlayer(playerId) {
  const team = currentTeam();
  if (!team) return;
  const half = getHalf(team, currentInning());
  const player = getPlayer(team, playerId);
  const atBat = getAtBat(team, currentInning(), playerId);
  if (!player || (atBat && atBat.status !== "onBase")) return;
  if (!atBat && nextBatter(team, half)?.id !== playerId) {
    showScoringMessage(`The next batter is ${nextBatter(team, half)?.name ?? "not available"}. Keep the lineup in order.`);
    return;
  }
  selectedPlayerId = selectedPlayerId === playerId ? null : playerId;
  showScoringMessage(selectedPlayerId ? `Selected ${player.name}. Choose a move below the diamond or OUT.` : "");
  renderScoring();
}

function renderDiamond(team, inning) {
  const occupied = getOccupied(team, inning);
  const batter = nextBatter(team, getHalf(team, inning));
  const occupiedBases = [...occupied.entries()]
    .sort(([baseA], [baseB]) => baseA - baseB)
    .map(([base, playerId]) => `${BASE_NAMES[base]}: ${getPlayer(team, playerId)?.name ?? "Unknown player"}`);
  els.baseOccupancy.textContent = occupiedBases.length
    ? `On base — ${occupiedBases.join(" · ")}`
    : "Bases are empty.";
  for (const baseButton of els.diamond.querySelectorAll(".base[data-base]")) {
    const base = Number(baseButton.dataset.base);
    const playerId = occupied.get(base);
    const player = playerId ? getPlayer(team, playerId) : null;
    const occupant = baseButton.querySelector(".base-occupant");
    occupant.textContent = player?.name ?? "";
    occupant.disabled = !player;
    occupant.setAttribute("aria-label", player ? `Select ${player.name} on ${BASE_NAMES[base]} base` : "");
    baseButton.classList.toggle("has-player", Boolean(player));
    baseButton.setAttribute("aria-label", player ? `${BASE_NAMES[base]} base, ${player.name}` : `${BASE_NAMES[base]} base`);
  }
  const nextPlayerButton = document.getElementById("diamond-next-player");
  nextPlayerButton.textContent = batter ? `Next up: ${batter.name}` : "No next player";
  nextPlayerButton.disabled = !batter || isHalfComplete(team, inning);
  nextPlayerButton.onclick = () => {
    if (batter) selectPlayer(batter.id);
  };
  els.selectedPlayer.textContent = selectedPlayerId ? `Selected: ${getPlayer(team, selectedPlayerId)?.name ?? "player"}` : `Next: ${nextBatter(team)?.name ?? "lineup complete"}`;
  renderPlayerMoveOptions(team, inning);
}

function renderPlayerMoveOptions(team, inning) {
  const player = selectedPlayerId ? getPlayer(team, selectedPlayerId) : null;
  const half = getHalf(team, inning);
  const atBat = player ? getAtBat(team, inning, player.id) : null;
  els.playerMoveOptions.replaceChildren();
  els.playerMoveOptions.hidden = !player;
  if (!player) return;

  const heading = document.createElement("span");
  heading.className = "move-options-label";
  heading.textContent = `Move ${player.name} to:`;
  els.playerMoveOptions.append(heading);

  const destinations = atBat
    ? (atBat.status === "onBase" ? Array.from({ length: 4 - atBat.base }, (_, index) => atBat.base + index + 1) : [])
    : nextBatter(team, half)?.id === player.id ? [1, 2, 3, 4] : [];
  for (const destination of destinations) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button-quiet move-option";
    button.textContent = BASE_NAMES[destination];
    button.addEventListener("click", () => recordBase(player.id, destination));
    els.playerMoveOptions.append(button);
  }
  const outButton = document.createElement("button");
  outButton.type = "button";
  outButton.className = "button button-out move-option";
  outButton.textContent = "Out";
  outButton.disabled = isHalfComplete(team, inning);
  outButton.addEventListener("click", () => recordOut(player.id));
  els.playerMoveOptions.append(outButton);
}

function renderInningSummary(team, inning) {
  const half = getHalf(team, inning);
  const lineupPlayed = half.atBats.length;
  const runs = half.runs;
  const stats = [
    ["Played", `${lineupPlayed}/${team.players.length}`],
    ["Outs", `${half.outs}/3`],
    ["Runs", runs]
  ];
  els.inningSummary.replaceChildren();
  stats.forEach(([label, value]) => {
    const stat = document.createElement("span");
    stat.className = "summary-stat";
    const labelNode = document.createElement("span");
    labelNode.textContent = `${label} `;
    const valueNode = document.createElement("strong");
    valueNode.textContent = String(value);
    stat.append(labelNode, valueNode);
    els.inningSummary.append(stat);
  });
  const complete = isHalfComplete(team, inning);
  els.inningAlert.hidden = false;
  els.inningAlert.classList.toggle("complete", complete);
  if (complete) {
    els.inningAlert.textContent = game.inningRule === "three-outs"
      ? `Inning complete — ${half.outs} outs recorded. ${lineupPlayed} of ${team.players.length} players batted.`
      : `Inning complete — all ${team.players.length} players have batted. ${half.outs} outs recorded.`;
  } else if (half.outs >= 3) {
    els.inningAlert.textContent = `Three outs recorded. The inning continues because the current rule is to bat through the lineup.`;
  } else if (lineupPlayed >= team.players.length) {
    els.inningAlert.textContent = `Every player has batted. The inning continues until three outs under the current rule.`;
  } else {
    els.inningAlert.hidden = true;
    els.inningAlert.textContent = "";
  }
}

function renderInningScorecard(team, inning) {
  const half = getHalf(team, inning);
  const playerAtBats = new Map(half.atBats.map(atBat => [atBat.playerId, atBat]));
  els.scorecardTeamLabel.textContent = `${team.name} · Inning ${inning}`;
  els.inningScorecard.replaceChildren();
  const orderedAtBats = half.atBats.slice().sort((a, b) => {
    const playerA = getPlayer(team, a.playerId);
    const playerB = getPlayer(team, b.playerId);
    return (playerA?.order ?? 0) - (playerB?.order ?? 0);
  });
  if (!orderedAtBats.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty-scorecard";
    cell.textContent = "Recorded plays will appear here.";
    row.append(cell);
    els.inningScorecard.append(row);
  }
  orderedAtBats.forEach(atBat => {
    const player = getPlayer(team, atBat.playerId);
    const row = document.createElement("tr");
    const order = document.createElement("td");
    order.textContent = String(player?.order ?? "");
    const name = document.createElement("td");
    name.textContent = player?.name ?? "Unknown player";
    const progressCell = document.createElement("td");
    const progress = document.createElement("div");
    progress.className = "progress-dots";
    atBat.path.forEach((base, index) => {
      const step = document.createElement("span");
      step.className = `progress-step${base === 4 ? " run" : ""}`;
      step.title = `Reached ${BASE_NAMES[base]} base`;
      step.setAttribute("aria-label", BASE_NAMES[base]);
      const dot = document.createElement("i");
      dot.className = "dot";
      step.append(dot);
      progress.append(step);
    });
    if (atBat.status === "out" && atBat.path.length === 0) {
      const outDot = document.createElement("span");
      outDot.className = "progress-step";
      const dot = document.createElement("i");
      dot.className = "dot";
      outDot.append(dot);
      progress.append(outDot);
    }
    progressCell.append(progress);
    const result = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = `result-tag${atBat.status === "out" ? " out" : atBat.status === "run" ? " run" : ""}`;
    tag.textContent = atBat.status === "out" ? `Out ${atBat.outNumber}` : atBat.status === "run" ? "Run" : `On ${BASE_NAMES[atBat.base]}`;
    result.append(tag);
    row.append(order, name, progressCell, result);
    els.inningScorecard.append(row);
  });
}

function renderScoring() {
  const team = currentTeam();
  if (!team) return;
  const inning = currentInning();
  const completionMessage = inningCompletionMessage(team, getHalf(team, inning));
  if (completionMessage) showScoringMessage(completionMessage);
  renderLineup(team, inning);
  renderDiamond(team, inning);
  renderInningSummary(team, inning);
  renderInningScorecard(team, inning);
  els.diamondOut.disabled = isHalfComplete(team, inning);
  els.diamondOut.title = els.diamondOut.disabled ? inningCompletionMessage(team, getHalf(team, inning)) : "Record the selected player, or next batter, as out";
  els.undoLastAction.disabled = !game.undoHistory?.length;
  els.undoLastAction.title = els.undoLastAction.disabled ? "No earlier scoring state" : "Go back one scoring action";
  els.redoAction.disabled = !game.redoHistory?.length;
  els.redoAction.title = els.redoAction.disabled ? "No later scoring state" : "Go forward one scoring action";
}

function render() {
  if (!game) {
    els.gameArea.hidden = true;
    els.saveState.textContent ||= "Ready to set up";
    return;
  }
  els.gameArea.hidden = false;
  els.setupContent.hidden = setupCollapsed;
  els.toggleSetup.textContent = setupCollapsed ? "Show setup" : "Hide setup";
  els.toggleSetup.setAttribute("aria-expanded", String(!setupCollapsed));
  renderTeamAndInningsOptions();
  renderScoreboard();
  renderScoring();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(text) {
  return (text || "tball-scorecard").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tball-scorecard";
}

function exportJson() {
  if (!game) return;
  const exportData = {
    format: "tball-scorebook",
    version: 1,
    exportedAt: new Date().toISOString(),
    game
  };
  downloadBlob(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }), `${safeFilename(game.name)}.json`);
}

function drawDotScoreCell(ctx, x, y, size, atBat) {
  const center = x + size / 2;
  const middle = y + size / 2;
  const inset = size * .12;
  const points = {
    1: [x + size - inset, middle],
    2: [center, y + inset],
    3: [x + inset, middle],
    4: [center, y + size - inset]
  };
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(center, middle, size * .19, 0, Math.PI * 2);
  ctx.stroke();
  if (!atBat) return;

  const scoringPath = atBat.path.filter(base => base !== 4 || atBat.status === "run");
  if (scoringPath.length) {
    ctx.strokeStyle = "#111";
    ctx.fillStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    scoringPath.forEach((base, index) => {
      const [px, py] = points[base];
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    for (const base of scoringPath) {
      const [px, py] = points[base];
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2.5, size * .045), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (atBat.status === "run") {
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(center, middle, size * .16, 0, Math.PI * 2);
    ctx.fill();
  } else if (atBat.status === "out") {
    ctx.fillStyle = "#111";
    ctx.font = `bold ${Math.round(size * .22)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(atBat.outNumber), center, middle);
  }
}

function drawTeamScorecard(ctx, team, x, y, panelWidth, rowHeight, inningWidth, maxRows) {
  const numberWidth = 45;
  const nameWidth = 205;
  const positionWidth = 48;
  const inningsX = x + numberWidth + nameWidth + positionWidth;
  const headerHeight = 62;
  const tableHeight = headerHeight + (maxRows + 1) * rowHeight;

  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, panelWidth, tableHeight);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(x, y, panelWidth, tableHeight);
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const teamRole = team.id === "home" ? "HOME TEAM" : "VISITING TEAM";
  const heading = `${teamRole} — ${team.name.toUpperCase()}`;
  ctx.font = "bold 22px sans-serif";
  while (ctx.measureText(heading).width > panelWidth - 24 && Number.parseInt(ctx.font, 10) > 14) {
    ctx.font = `bold ${Number.parseInt(ctx.font, 10) - 1}px sans-serif`;
  }
  ctx.fillText(heading, x + 12, y + 17, panelWidth - 24);
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BAT", x + numberWidth / 2, y + 49);
  ctx.fillText("NAME", x + numberWidth + nameWidth / 2, y + 49);
  ctx.fillText("F/P", x + numberWidth + nameWidth + positionWidth / 2, y + 49);
  for (let inning = 1; inning <= 12; inning += 1) {
    const cellX = inningsX + (inning - 1) * inningWidth;
    ctx.fillText(String(inning), cellX + inningWidth / 2, y + 49);
  }

  ctx.beginPath();
  ctx.moveTo(x, y + 33);
  ctx.lineTo(x + panelWidth, y + 33);
  ctx.moveTo(x, y + headerHeight);
  ctx.lineTo(x + panelWidth, y + headerHeight);
  ctx.moveTo(x + numberWidth, y + 33);
  ctx.lineTo(x + numberWidth, y + headerHeight + maxRows * rowHeight);
  ctx.moveTo(x + numberWidth + nameWidth, y + 33);
  ctx.lineTo(x + numberWidth + nameWidth, y + headerHeight + maxRows * rowHeight);
  ctx.moveTo(inningsX, y + 33);
  ctx.lineTo(inningsX, y + headerHeight + maxRows * rowHeight);
  for (let inning = 1; inning < 12; inning += 1) {
    const dividerX = inningsX + inning * inningWidth;
    ctx.moveTo(dividerX, y + 33);
    ctx.lineTo(dividerX, y + headerHeight + maxRows * rowHeight);
  }
  ctx.stroke();

  for (let row = 0; row < maxRows; row += 1) {
    const rowY = y + headerHeight + row * rowHeight;
    const player = team.players[row];
    ctx.beginPath();
    ctx.moveTo(x, rowY + rowHeight);
    ctx.lineTo(x + panelWidth, rowY + rowHeight);
    ctx.stroke();
    if (player) {
      ctx.fillStyle = "#111";
      ctx.textAlign = "center";
      ctx.font = "15px sans-serif";
      ctx.fillText(String(player.order), x + numberWidth / 2, rowY + rowHeight / 2);
      ctx.textAlign = "left";
      ctx.font = "16px sans-serif";
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + numberWidth + 8, rowY + 1, nameWidth - 16, rowHeight - 2);
      ctx.clip();
      ctx.fillText(player.name, x + numberWidth + 8, rowY + rowHeight / 2);
      ctx.restore();
    }
    for (let inning = 1; inning <= 12; inning += 1) {
      const cellX = inningsX + (inning - 1) * inningWidth;
      const atBat = player && inning <= game.innings ? getAtBat(team, inning, player.id) : null;
      const cellSize = Math.min(inningWidth, rowHeight);
      drawDotScoreCell(ctx, cellX + (inningWidth - cellSize) / 2, rowY + (rowHeight - cellSize) / 2, cellSize, atBat);
    }
  }

  const totalsY = y + headerHeight + maxRows * rowHeight;
  ctx.fillStyle = "#111";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("INN / GAME", x + numberWidth + nameWidth / 2, totalsY + rowHeight / 2);
  let runningTotal = 0;
  for (let inning = 1; inning <= 12; inning += 1) {
    const cellX = inningsX + (inning - 1) * inningWidth;
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cellX, totalsY + rowHeight);
    ctx.lineTo(cellX + inningWidth, totalsY);
    ctx.stroke();
    if (inning > game.innings) continue;
    const inningRuns = team.innings?.[inning]?.runs ?? 0;
    runningTotal += inningRuns;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(String(inningRuns), cellX + inningWidth * .27, totalsY + rowHeight * .27);
    ctx.fillText(String(runningTotal), cellX + inningWidth * .73, totalsY + rowHeight * .73);
  }
  ctx.textAlign = "left";
}

function createScorecardCanvas(scale = 2) {
  if (!game) return;
  const canvas = document.createElement("canvas");
  const rowHeight = 78;
  const inningWidth = 76;
  const numberWidth = 45;
  const nameWidth = 205;
  const positionWidth = 48;
  const panelWidth = numberWidth + nameWidth + positionWidth + inningWidth * 12;
  const margin = 44;
  const gutter = 34;
  const maxRows = Math.max(12, ...game.teams.map(team => team.players.length));
  const teamTop = 140;
  const tableHeight = 62 + (maxRows + 1) * rowHeight;
  canvas.width = (margin * 2 + panelWidth * 2 + gutter) * scale;
  canvas.height = (teamTop + tableHeight + 42) * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
  ctx.fillStyle = "#111";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("T-BALL SCORECARD", margin, 33);
  ctx.font = "16px sans-serif";
  ctx.fillText(`Date: ${game.date || ""}`, margin, 72);
  ctx.fillText(`Ground: ${game.ground || ""}`, margin, 101);
  ctx.font = "bold 20px sans-serif";
  ctx.fillText(game.name || "Game", margin + 360, 72);
  ctx.font = "14px sans-serif";
  ctx.fillText("DOT METHOD · FIRST BASE → SECOND → THIRD → HOME", margin + 360, 103);

  drawTeamScorecard(ctx, game.teams[1], margin, teamTop, panelWidth, rowHeight, inningWidth, maxRows);
  drawTeamScorecard(ctx, game.teams[0], margin + panelWidth + gutter, teamTop, panelWidth, rowHeight, inningWidth, maxRows);

  return canvas;
}

function showScorecardPreview() {
  if (!game) return;
  const canvas = createScorecardCanvas(1);
  if (!canvas) {
    window.alert("Your browser could not create the scorecard preview.");
    return;
  }
  canvas.className = "scorecard-preview-canvas";
  els.scorecardPreviewContent.replaceChildren(canvas);
  els.scorecardPreview.showModal();
}

function exportImage() {
  if (!game) return;
  const canvas = createScorecardCanvas(2);
  if (!canvas) {
    window.alert("Your browser could not create a scorecard image. Please use JSON export instead.");
    return;
  }
  canvas.toBlob(blob => {
    if (!blob) {
      window.alert("Your browser could not export the scorecard image.");
      return;
    }
    downloadBlob(blob, `${safeFilename(game.name)}-scorecard.jpg`);
  }, "image/jpeg", 0.95);
}

function bindEvents() {
  els.startGame.addEventListener("click", saveSetup);
  els.toggleSetup.addEventListener("click", () => {
    setupCollapsed = !setupCollapsed;
    render();
  });
  els.battingTeam.addEventListener("change", () => {
    selectedPlayerId = null;
    showScoringMessage("");
    renderScoring();
  });
  els.inningSelect.addEventListener("change", () => {
    selectedPlayerId = null;
    showScoringMessage("");
    renderScoring();
  });
  els.diamondOut.addEventListener("click", () => recordOut());
  els.undoLastAction.addEventListener("click", undoLastAction);
  els.redoAction.addEventListener("click", redoAction);
  els.viewScorecard.addEventListener("click", showScorecardPreview);
  els.closeScorecardPreview.addEventListener("click", () => els.scorecardPreview.close());
  els.exportJson.addEventListener("click", exportJson);
  els.exportImage.addEventListener("click", exportImage);
  for (const base of els.diamond.querySelectorAll(".base[data-base]")) {
    base.addEventListener("click", event => {
      if (!event.target.closest(".base-occupant")) return;
      const team = currentTeam();
      const inning = currentInning();
      const occupiedId = getOccupied(team, inning).get(Number(base.dataset.base));
      if (occupiedId) selectPlayer(occupiedId);
    });
  }
  els.diamondOut.addEventListener("dragover", event => {
    event.preventDefault();
    els.diamondOut.classList.add("drag-over");
  });
  els.diamondOut.addEventListener("dragleave", () => els.diamondOut.classList.remove("drag-over"));
  els.diamondOut.addEventListener("drop", event => {
    event.preventDefault();
    els.diamondOut.classList.remove("drag-over");
    const playerId = event.dataTransfer.getData("text/plain") || selectedPlayerId || nextBatter(currentTeam())?.id;
    recordOut(playerId);
  });
}

function populateSetupFromGame() {
  if (!game) {
    els.gameDate.value = new Date().toISOString().slice(0, 10);
    return;
  }
  els.gameName.value = game.name ?? "";
  els.gameDate.value = game.date || new Date().toISOString().slice(0, 10);
  els.gameGround.value = game.ground ?? "";
  els.inningsCount.value = String(game.innings);
  els.inningRule.value = game.inningRule;
  els.homeName.value = game.teams[0].name;
  els.awayName.value = game.teams[1].name;
  els.homeLineup.value = game.teams[0].players.map(player => player.name).join("\n");
  els.awayLineup.value = game.teams[1].players.map(player => player.name).join("\n");
}

bindEvents();
populateSetupFromGame();
render();
