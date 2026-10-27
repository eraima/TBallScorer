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
  playersPerInning: document.querySelector("#players-per-inning"),
  outsPerInning: document.querySelector("#outs-per-inning"),
  homeName: document.querySelector("#home-name"),
  awayName: document.querySelector("#away-name"),
  homeTeamChoice: document.querySelector("#home-team-choice"),
  awayTeamChoice: document.querySelector("#away-team-choice"),
  homeLineup: document.querySelector("#home-lineup"),
  awayLineup: document.querySelector("#away-lineup"),
  homeRoster: document.querySelector("#home-roster"),
  awayRoster: document.querySelector("#away-roster"),
  addHomePlayer: document.querySelector("#add-home-player"),
  addAwayPlayer: document.querySelector("#add-away-player"),
  startGame: document.querySelector("#start-game"),
  gameArea: document.querySelector("#game-area"),
  scoreboardTitle: document.querySelector("#scoreboard-title"),
  scoreboardTeams: document.querySelector("#scoreboard-teams"),
  battingTeam: document.querySelector("#batting-team"),
  inningSelect: document.querySelector("#inning-select"),
  diamondNextPlayer: document.querySelector("#diamond-next-player"),
  inningSummary: document.querySelector("#inning-summary"),
  inningAlert: document.querySelector("#inning-alert"),
  endInning: document.querySelector("#end-inning"),
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
  scorecardEditActions: document.querySelector("#scorecard-edit-actions"),
  scorecardRoutePreview: document.querySelector("#scorecard-route-preview"),
  newPlayerName: document.querySelector("#new-player-name"),
  addPlayer: document.querySelector("#add-player"),
  viewScorecard: document.querySelector("#view-scorecard"),
  scorecardPreview: document.querySelector("#scorecard-preview"),
  scorecardPreviewContent: document.querySelector("#scorecard-preview-content"),
  closeScorecardPreview: document.querySelector("#close-scorecard-preview"),
  exportJson: document.querySelector("#export-json"),
  exportImage: document.querySelector("#export-image"),
  lineupContent: document.querySelector("#lineup-content"),
  toggleLineup: document.querySelector("#toggle-lineup"),
  userManual: document.querySelector("#user-manual"),
  openManual: document.querySelector("#open-manual"),
  closeManual: document.querySelector("#close-manual"),
  infoDialog: document.querySelector("#info-dialog"),
  infoDialogTitle: document.querySelector("#info-dialog-title"),
  infoDialogMessage: document.querySelector("#info-dialog-message"),
  closeInfoDialog: document.querySelector("#close-info-dialog"),
  confirmDialog: document.querySelector("#confirm-dialog"),
  confirmDialogTitle: document.querySelector("#confirm-dialog-title"),
  confirmDialogMessage: document.querySelector("#confirm-dialog-message"),
  cancelConfirm: document.querySelector("#cancel-confirm"),
  acceptConfirm: document.querySelector("#accept-confirm"),
  qrGenerateDialog: document.querySelector("#qr-generate-dialog"),
  closeQrGenerate: document.querySelector("#close-qr-generate"),
  qrScanDialog: document.querySelector("#qr-scan-dialog"),
  closeQrScan: document.querySelector("#close-qr-scan")
};

let game = loadGame();
let selectedPlayerId = null;
let selectedScorecardPlayerIds = new Set();
let scorecardEditRoute = [];
let scorecardEditTerminal = null;
const setupRosters = { home: [], away: [] };
const staticTeams = normalizeStaticTeams(window.TEAM_ROSTER_DATA ?? []);
let setupCollapsed = isMobileLayout() && Boolean(game);
let lineupCollapsed = isMobileLayout() && Boolean(game);
let pendingConfirmation = null;

function isMobileLayout() {
  return window.matchMedia?.("(max-width: 760px)").matches ?? false;
}

function makeId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStaticTeams(teams) {
  if (!Array.isArray(teams)) {
    console.error("The static team list must be an array.");
    return [];
  }
  const seenIds = new Set();
  return teams.flatMap((team, index) => {
    if (!team || typeof team.id !== "string" || !team.id.trim() ||
        typeof team.name !== "string" || !team.name.trim() ||
        !Array.isArray(team.players) ||
        !team.players.every(player => typeof player === "string" && player.trim())) {
      console.error(`Ignoring invalid static team entry at position ${index + 1}.`);
      return [];
    }
    if (seenIds.has(team.id)) {
      console.error(`Ignoring duplicate static team ID "${team.id}".`);
      return [];
    }
    seenIds.add(team.id);
    if (team.players.length > 40) {
      console.error(`Ignoring static team "${team.name}" because it has more than 40 players.`);
      return [];
    }
    return [{
      id: team.id,
      name: team.name.trim(),
      players: team.players.map(player => player.trim())
    }];
  });
}

function populateTeamChoices() {
  for (const select of [els.homeTeamChoice, els.awayTeamChoice]) {
    select.replaceChildren();
    const newTeam = document.createElement("option");
    newTeam.value = "";
    newTeam.textContent = "New team";
    select.append(newTeam);
    staticTeams.forEach((team, index) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      select.append(option);
    });
  }
}

function chooseSetupTeam(teamId, selectedTeamId = "") {
  const teamName = teamId === "home" ? els.homeName : els.awayName;
  const teamChoice = teamId === "home" ? els.homeTeamChoice : els.awayTeamChoice;
  const roster = setupRosters[teamId];
  const selectedTeam = staticTeams.find(team => team.id === selectedTeamId);
  teamChoice.value = selectedTeam?.id ?? "";
  teamName.value = selectedTeam?.name ?? "";
  roster.splice(0, roster.length, ...(selectedTeam?.players ?? []));
  updateSetupLineup(teamId);
}

function matchStaticTeam(name, players) {
  const normalizedPlayers = players.map(player => player.trim());
  return staticTeams.find(team => team.name === name &&
    team.players.length === normalizedPlayers.length &&
    team.players.every((player, index) => player === normalizedPlayers[index]));
}

function loadGame() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.teams) || parsed.teams.length !== 2) {
      throw new Error("The saved game has an unsupported format.");
    }
    parsed.playersPerInning ??= 9;
    parsed.outsPerInning ??= 3;
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

function addAtBat(half, atBat) {
  half.starterId ??= half.atBats[0]?.playerId ?? atBat.playerId;
  half.atBats.push(atBat);
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
  showScoringMessage("");
  persistGame();
  render();
}

function redoAction() {
  if (!game?.redoHistory?.length) return;
  game.undoHistory ??= [];
  game.undoHistory.push(JSON.stringify(game.teams));
  game.teams = JSON.parse(game.redoHistory.pop());
  selectedPlayerId = null;
  showScoringMessage("");
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

function beginPlayAction(half, newBatter = false) {
  if (newBatter || half.activePlayId === undefined) {
    half.playCounter = (half.playCounter ?? 0) + 1;
    half.activePlayId = half.playCounter;
  }
  half.actionCounter = (half.actionCounter ?? 0) + 1;
  return { playId: half.activePlayId, actionId: half.actionCounter };
}

function recordAdvance(atBat, from, to, context) {
  atBat.advances ??= [];
  atBat.advanceMeta ??= atBat.advances.map(() => null);
  const previous = atBat.advances.at(-1);
  const previousMeta = atBat.advanceMeta.at(-1);
  if (previous && previousMeta?.playId === context.playId &&
      previousMeta.actionId !== context.actionId && previous.to === from) {
    previous.to = to;
    previousMeta.actionId = context.actionId;
  } else {
    atBat.advances.push({ from, to });
    atBat.advanceMeta.push({ playId: context.playId, actionId: context.actionId });
  }
  atBat.path.push(to);
}

function getAtBatAdvances(atBat) {
  if (atBat.advances) return atBat.advances;
  let from = 4;
  return atBat.path.map(to => {
    const advance = { from, to };
    from = to;
    return advance;
  });
}

function getScoringTrace(atBat) {
  const advances = getAtBatAdvances(atBat);
  const homeRunRoute = advances.length === 4 &&
    advances[0].from === 4 && advances[0].to === 1 &&
    advances[1].from === 1 && advances[1].to === 2 &&
    advances[2].from === 2 && advances[2].to === 3 &&
    advances[3].from === 3 && advances[3].to === 4;
  if (homeRunRoute) return [[4, 1, 2, 3, 4]];

  return advances.map(({ from, to }) => {
    if (!Number.isInteger(to) || to < 1 || to > 4) return [];
    if (from === 4) {
      if (to === 1) return [1];
      return [4, ...Array.from({ length: to }, (_, index) => index + 1)];
    }
    if (!Number.isInteger(from) || from < 1 || from > 3 || to <= from) return [to];
    if (to === from + 1) return [to];
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }).filter(route => route.length);
}

function inningHasEnded(team, inning) {
  const half = team.innings?.[inning];
  return Boolean(half && (
    half.ended ||
    half.outs >= (game.outsPerInning ?? 3) ||
    (half.atBats?.length ?? 0) >= team.players.length
  ));
}

function getInningStarter(team, inning) {
  if (inning <= 1) return null;

  let totalAtBats = 0;
  for (let i = 1; i < inning; i++) {
    totalAtBats += team.innings?.[i]?.atBats?.length ?? 0;
  }

  const starterIndex = totalAtBats % team.players.length;
  return team.players[starterIndex]?.id ?? null;
}

function isHalfComplete(team, inning) {
  const half = getHalf(team, inning);
  return Boolean(half.ended || nextBatter(team, half) === null);
}

function inningCompletionMessage(team, inning) {
  if (getHalf(team, inning).ended) return "This inning has ended. Choose the next team or inning to continue.";
  if (!isHalfComplete(team, inning)) return "";
  return `Inning complete: all ${team.players.length} players have had a turn. Choose another inning to keep scoring.`;
}

function lineupLimitMessage(team) {
  const limit = Math.min(game.playersPerInning, team.players.length);
  const message = limit === 1
    ? "The only player has batted this inning."
    : `${limit} hitters have batted this inning.`;
  return `${message} Choose another inning to keep scoring.`;
}

function showScoringMessage(message, success = false) {
  els.scoringMessage.textContent = message;
  els.scoringMessage.hidden = !message;
  els.scoringMessage.classList.toggle("success", success);
}

function parseLineup(text) {
  return text.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
}

function updateSetupLineup(teamId) {
  const textarea = teamId === "home" ? els.homeLineup : els.awayLineup;
  const roster = teamId === "home" ? els.homeRoster : els.awayRoster;
  textarea.value = setupRosters[teamId].join("\n");
  roster.replaceChildren();
  setupRosters[teamId].forEach((name, index) => {
    const item = document.createElement("li");
    item.className = "roster-editor-item";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 60;
    input.value = name;
    input.setAttribute("aria-label", `${teamId === "home" ? "Home" : "Away"} player ${index + 1} name`);
    input.addEventListener("change", () => {
      setupRosters[teamId][index] = input.value.trim();
      updateSetupLineup(teamId);
    });
    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.className = "button button-quiet roster-order";
    moveUp.textContent = "↑";
    moveUp.disabled = index === 0;
    moveUp.setAttribute("aria-label", `Move ${name || `player ${index + 1}`} up`);
    moveUp.addEventListener("click", () => {
      [setupRosters[teamId][index - 1], setupRosters[teamId][index]] =
        [setupRosters[teamId][index], setupRosters[teamId][index - 1]];
      updateSetupLineup(teamId);
    });
    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.className = "button button-quiet roster-order";
    moveDown.textContent = "↓";
    moveDown.disabled = index === setupRosters[teamId].length - 1;
    moveDown.setAttribute("aria-label", `Move ${name || `player ${index + 1}`} down`);
    moveDown.addEventListener("click", () => {
      [setupRosters[teamId][index + 1], setupRosters[teamId][index]] =
        [setupRosters[teamId][index], setupRosters[teamId][index + 1]];
      updateSetupLineup(teamId);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button button-danger roster-remove";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      setupRosters[teamId].splice(index, 1);
      updateSetupLineup(teamId);
    });
    item.append(input, moveUp, moveDown, remove);
    roster.append(item);
  });
}

function addSetupPlayer(teamId) {
  if (setupRosters[teamId].length >= 40) {
    window.alert("Each lineup can have up to 40 players.");
    return;
  }
  setupRosters[teamId].push("");
  updateSetupLineup(teamId);
  const inputs = (teamId === "home" ? els.homeRoster : els.awayRoster).children;
  inputs[inputs.length - 1]?.children[0]?.focus?.();
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
  const playersPerInning = Number(els.playersPerInning.value);
  const outsPerInning = Number(els.outsPerInning.value);
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
  if (!Number.isSafeInteger(playersPerInning) || playersPerInning < 1) {
    window.alert("Enter a positive whole number of hitters per inning.");
    return;
  }
  if (!Number.isSafeInteger(outsPerInning) || outsPerInning < 1) {
    window.alert("Enter a positive whole number of outs per inning.");
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
  if (game) {
    askForConfirmation(
      "Replace saved game?",
      "Save this setup as a new game? This replaces the game currently saved on this device.",
      "Yes, replace game",
      () => applySetup(updatedTeams, innings, playersPerInning, outsPerInning)
    );
    return;
  }
  applySetup(updatedTeams, innings, playersPerInning, outsPerInning);
}

function applySetup(updatedTeams, innings, playersPerInning, outsPerInning) {
  game = {
    version: 1,
    name: els.gameName.value.trim(),
    date: els.gameDate.value,
    ground: els.gameGround.value.trim(),
    innings,
    playersPerInning,
    outsPerInning,
    teams: updatedTeams
  };
  selectedPlayerId = null;
  selectedScorecardPlayerIds.clear();
  setupCollapsed = isMobileLayout();
  lineupCollapsed = isMobileLayout();
  els.battingTeam.value = game.teams[0].id;
  els.inningSelect.value = "1";
  persistGame();
  render();
}

function askForConfirmation(title, message, acceptText, onAccept) {
  pendingConfirmation = onAccept;
  els.confirmDialogTitle.textContent = title;
  els.confirmDialogMessage.textContent = message;
  els.acceptConfirm.textContent = acceptText;
  openDialog(els.confirmDialog);
}

function resolveConfirmation(accepted) {
  const onAccept = pendingConfirmation;
  pendingConfirmation = null;
  closeDialog(els.confirmDialog);
  if (accepted) onAccept?.();
}

function recordBase(playerId, destination) {
  const team = currentTeam();
  const inning = currentInning();
  if (!team) return;
  const half = getHalf(team, inning);
  const atBat = getAtBat(team, inning, playerId);
  const returningSkipped = atBat?.status === "skipped";
  if (half.ended || (isHalfComplete(team, inning) && !returningSkipped)) {
    showScoringMessage(inningCompletionMessage(team, inning));
    return;
  }
  const scoredNames = [];
  const batter = getPlayer(team, playerId);
  if (!batter) return;
  let moveContext;

  if (!atBat || returningSkipped) {
    const upcomingBatter = nextBatter(team, half);
    if (!returningSkipped && upcomingBatter?.id !== playerId) {
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
      scoredNames.push(...scoringNames, batter.name);
      saveUndoPoint();
      moveContext = beginPlayAction(half, true);
      for (const runnerId of occupied.values()) {
        const runner = getAtBat(team, inning, runnerId);
        if (!runner) continue;
        recordAdvance(runner, runner.base, 4, moveContext);
        runner.status = "run";
        runner.base = null;
      }
      const batterAtBat = atBat ?? { playerId };
      Object.assign(batterAtBat, { path: [], advances: [], advanceMeta: [], status: "run", base: null, outNumber: null });
      for (const base of [1, 2, 3, 4]) recordAdvance(batterAtBat, base === 1 ? 4 : base - 1, base, moveContext);
      if (!atBat) addAtBat(half, batterAtBat);
      half.runs += occupied.size + 1;
    } else {
      const cascade = planRunnerCascade(team, inning, destination);
      scoredNames.push(...cascade.scoring);
      saveUndoPoint();
      moveContext = beginPlayAction(half, true);
      applyRunnerCascade(team, inning, cascade.moves, moveContext);
      const batterAtBat = atBat ?? { playerId };
      Object.assign(batterAtBat, {
        playerId,
        path: [],
        advances: [],
        status: "onBase",
        base: destination,
        outNumber: null
      });
      recordAdvance(batterAtBat, 4, destination, moveContext);
      if (!atBat) addAtBat(half, batterAtBat);
    }
    if (!returningSkipped) {
      team.nextBatterIndex = (team.players.findIndex(player => player.id === playerId) + 1) % team.players.length;
    }
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
      moveContext = beginPlayAction(half);
      recordAdvance(atBat, atBat.base, 4, moveContext);
      atBat.status = "run";
      atBat.base = null;
      half.runs += 1;
      scoredNames.push(batter.name);
    } else {
      const cascade = planRunnerCascade(team, inning, destination, playerId, atBat.base);
      scoredNames.push(...cascade.scoring);
      saveUndoPoint();
      moveContext = beginPlayAction(half);
      applyRunnerCascade(team, inning, cascade.moves, moveContext);
      recordAdvance(atBat, atBat.base, destination, moveContext);
      atBat.base = destination;
    }
  }
  selectedPlayerId = null;
  showScoringMessage(scoredNames.length ? `${scoredNames.join(", ")} moved home and scored.` : "", scoredNames.length > 0);
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

function applyRunnerCascade(team, inning, moves, context) {
  const half = getHalf(team, inning);
  for (const move of moves) {
    const atBat = getAtBat(team, inning, move.playerId);
    if (!atBat) continue;
    recordAdvance(atBat, atBat.base, move.destination, context);
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
  let atBat = getAtBat(team, inning, playerId);
  const returningSkipped = atBat?.status === "skipped";
  if (half.ended || (isHalfComplete(team, inning) && !returningSkipped)) {
    showScoringMessage(inningCompletionMessage(team, inning));
    return;
  }
  if (!atBat || returningSkipped) {
    const batter = nextBatter(team, half);
    if (!returningSkipped && batter?.id !== playerId) {
      showScoringMessage(batter
        ? `The next batter is ${batter.name}. Keep the lineup in order.`
        : `All ${team.players.length} players have batted this inning. Choose another inning to keep scoring.`);
      return;
    }
    saveUndoPoint();
    if (!returningSkipped) {
      beginPlayAction(half, true);
      atBat = { playerId, path: [], status: "out", base: null, outNumber: null };
      addAtBat(half, atBat);
      team.nextBatterIndex = (team.players.findIndex(player => player.id === playerId) + 1) % team.players.length;
    } else {
      Object.assign(atBat, { status: "out", base: null, path: [], advances: [], advanceMeta: [] });
    }
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

function skipPlayer(playerId) {
  const team = currentTeam();
  const inning = currentInning();
  if (!team) return;
  const half = getHalf(team, inning);
  const player = getPlayer(team, playerId);
  if (!player || getAtBat(team, inning, playerId) || nextBatter(team, half)?.id !== playerId) {
    showScoringMessage("Only the next batter can be skipped.");
    return;
  }
  saveUndoPoint();
  addAtBat(half, { playerId, path: [], advances: [], status: "skipped", base: null, outNumber: null });
  team.nextBatterIndex = (team.players.findIndex(candidate => candidate.id === playerId) + 1) % team.players.length;
  selectedPlayerId = null;
  showScoringMessage(`${player.name} skipped. The next player is up.`);
  updateCompletion(team, inning);
  persistGame();
  render();
}

function updateCompletion(team, inning) {
  const half = getHalf(team, inning);
  half.complete = Boolean(half.ended || nextBatter(team, half) === null);
}

function endHalfInning() {
  const team = currentTeam();
  if (!team) return;
  const inning = currentInning();
  const half = getHalf(team, inning);
  if (half.ended) return;
  saveUndoPoint();
  half.ended = true;
  half.complete = true;
  const next = getNextInningAction(team, inning);
  if (next) {
    els.battingTeam.value = next.team.id;
    els.inningSelect.value = String(next.inning);
  }
  selectedPlayerId = null;
  selectedScorecardPlayerIds.clear();
  showScoringMessage("");
  persistGame();
  render();
}

function getNextInningAction(team, inning) {
  const opposingTeam = game.teams.find(candidate => candidate.id !== team.id);
  if (opposingTeam && !opposingTeam.innings?.[inning]?.ended) {
    return { team: opposingTeam, inning };
  }
  if (inning < game.innings) return { team: game.teams[0], inning: inning + 1 };
  return null;
}

function addPlayerToCurrentTeam() {
  const team = currentTeam();
  const name = els.newPlayerName.value.trim();
  if (!team || !name) {
    if (!name) window.alert("Enter a player name.");
    return;
  }
  if (team.players.length >= 40) {
    window.alert("Each lineup can have up to 40 players.");
    return;
  }
  saveUndoPoint();
  const player = { id: makeId(), name, order: Math.max(0, ...team.players.map(candidate => candidate.order)) + 1 };
  team.players.push(player);
  els.newPlayerName.value = "";
  persistGame();
  render();
}

function renamePlayer(team, player, name) {
  const trimmed = name.trim();
  if (!trimmed) {
    window.alert("Player names cannot be blank.");
    render();
    return;
  }
  if (trimmed === player.name) return;
  saveUndoPoint();
  player.name = trimmed;
  persistGame();
  render();
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
  const batter = isHalfComplete(team, inning) ? null : nextBatter(team, half);
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
    li.setAttribute("role", "group");
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
    const name = document.createElement("input");
    name.type = "text";
    name.maxLength = 60;
    name.className = "player-name";
    name.value = player.name;
    name.setAttribute("aria-label", `Rename ${player.name}`);
    name.addEventListener("click", event => event.stopPropagation?.());
    name.addEventListener("keydown", event => event.stopPropagation?.());
    name.addEventListener("change", () => renamePlayer(team, player, name.value));
    const status = document.createElement("span");
    status.className = "player-status";
    status.textContent = atBat
      ? (atBat.status === "onBase" ? `${BASE_NAMES[atBat.base]} base` : atBat.status === "run" ? "Run" : atBat.status === "out" ? `Out ${atBat.outNumber}` : "Skipped")
      : (player.id === batter?.id ? "UP" : "");
    li.append(order, name, status);
    els.lineupList.append(li);
  });
  els.newPlayerName.value = "";
}

function playerStatusLabel(player, atBat, batter) {
  if (atBat?.status === "onBase") return `${player.name}, on ${BASE_NAMES[atBat.base]} base. Select to move runner.`;
  if (atBat?.status === "run") return `${player.name}, scored a run.`;
  if (atBat?.status === "out") return `${player.name}, out ${atBat.outNumber}.`;
  if (atBat?.status === "skipped") return `${player.name}, skipped. Select to let this player bat.`;
  return player.id === batter?.id ? `${player.name}, next batter.` : `${player.name}, waiting in lineup.`;
}

function selectPlayer(playerId) {
  const team = currentTeam();
  if (!team) return;
  const half = getHalf(team, currentInning());
  const atBat = getAtBat(team, currentInning(), playerId);
  if (half.ended || (isHalfComplete(team, currentInning()) && atBat?.status !== "skipped")) {
    showScoringMessage(inningCompletionMessage(team, currentInning()));
    return;
  }
  const player = getPlayer(team, playerId);
  if (!player || (atBat && atBat.status !== "onBase" && atBat.status !== "skipped")) return;
  if (!atBat && nextBatter(team, half)?.id !== playerId) {
    showScoringMessage(`The next batter is ${nextBatter(team, half)?.name ?? "not available"}. Keep the lineup in order.`);
    return;
  }
  selectedPlayerId = selectedPlayerId === playerId ? null : playerId;
  showScoringMessage(selectedPlayerId ? `Selected ${player.name}. Choose a move below the diamond or OUT.` : "");
  renderScoring();
}

function renderDiamond(team, inning) {
  const half = getHalf(team, inning);
  const occupied = getOccupied(team, inning);
  const batter = isHalfComplete(team, inning) ? null : nextBatter(team, half);
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
    occupant.setAttribute("aria-label", player ? `Select ${player.name} on ${BASE_NAMES[base]} base` : "");
    baseButton.classList.toggle("has-player", Boolean(player));
    baseButton.setAttribute("aria-label", player ? `${BASE_NAMES[base]} base, ${player.name}` : `${BASE_NAMES[base]} base`);
    const selected = selectedPlayerId ? getAtBat(team, inning, selectedPlayerId) : null;
    baseButton.setAttribute("aria-disabled", String(half.ended || (isHalfComplete(team, inning) && selected?.status !== "skipped")));
  }
  const nextPlayerButton = els.diamondNextPlayer;
  nextPlayerButton.textContent = batter ? `Next up: ${batter.name}` : "No next player";
  nextPlayerButton.disabled = !batter || isHalfComplete(team, inning);
  nextPlayerButton.onclick = () => {
    if (batter) selectPlayer(batter.id);
  };
  els.selectedPlayer.textContent = selectedPlayerId
    ? `Selected: ${getPlayer(team, selectedPlayerId)?.name ?? "player"}`
    : `Next: ${batter?.name ?? "lineup complete"}`;
  renderPlayerMoveOptions(team, inning);
}

function renderPlayerMoveOptions(team, inning) {
  const player = selectedPlayerId ? getPlayer(team, selectedPlayerId) : null;
  const half = getHalf(team, inning);
  const atBat = player ? getAtBat(team, inning, player.id) : null;
  els.playerMoveOptions.replaceChildren();
  const complete = half.ended || (isHalfComplete(team, inning) && atBat?.status !== "skipped");
  els.playerMoveOptions.hidden = !player || complete;
  if (!player || complete) return;

  const heading = document.createElement("span");
  heading.className = "move-options-label";
  heading.textContent = `Move ${player.name} to:`;
  els.playerMoveOptions.append(heading);

  const destinations = atBat
    ? (atBat.status === "onBase"
      ? Array.from({ length: 4 - atBat.base }, (_, index) => atBat.base + index + 1)
      : atBat.status === "skipped" ? [1, 2, 3, 4] : [])
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
  outButton.disabled = half.ended || (isHalfComplete(team, inning) && atBat?.status !== "skipped");
  outButton.addEventListener("click", () => recordOut(player.id));
  els.playerMoveOptions.append(outButton);
  if (!atBat) {
    const skipButton = document.createElement("button");
    skipButton.type = "button";
    skipButton.className = "button button-quiet move-option";
    skipButton.textContent = "Skip player";
    skipButton.addEventListener("click", () => skipPlayer(player.id));
    els.playerMoveOptions.append(skipButton);
  }
}

function renderInningSummary(team, inning) {
  const half = getHalf(team, inning);
  const lineupPlayed = half.atBats.length;
  const hitterLimit = game.playersPerInning;
  const runs = half.runs;
  const stats = [
    ["Played", `${lineupPlayed}/${hitterLimit}`],
    ["Outs", half.outs],
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
  const warnings = [];
  if (lineupPlayed >= hitterLimit) warnings.push(`Maximum of ${hitterLimit} hitters reached`);
  const outsReached = half.outs >= game.outsPerInning;
  if (outsReached) warnings.push(`${half.outs} outs recorded`);
  els.inningAlert.hidden = false;
  els.inningAlert.classList.toggle("complete", complete && warnings.length === 0);
  els.inningAlert.classList.toggle("warning", warnings.length > 0);
  if (half.ended) {
    els.inningAlert.textContent = "Inning ended. The next team or inning is selected automatically.";
  } else if (warnings.length) {
    els.inningAlert.textContent = `${warnings.join(". ")}. The inning should be ending, but you can continue scoring if needed.${complete ? " All players have had a turn." : ""}`;
  } else if (complete) {
    els.inningAlert.textContent = `All ${team.players.length} players have had a turn. End the inning to continue. ${half.outs} outs recorded.`;
  } else {
    els.inningAlert.hidden = true;
    els.inningAlert.textContent = "";
  }
  els.endInning.disabled = Boolean(half.ended);
  const next = getNextInningAction(team, inning);
  els.endInning.textContent = half.ended
    ? (next ? "Inning ended" : "Inning ended · Game complete")
    : next
      ? `End ${team.name} inning → Start ${next.team.name} inning ${next.inning}`
      : `End ${team.name} inning · Finish game`;
}

function toggleScorecardPlayer(playerId, selected) {
  if (selected) selectedScorecardPlayerIds.add(playerId);
  else selectedScorecardPlayerIds.delete(playerId);
  if (!selectedScorecardPlayerIds.size) resetScorecardEdit();
  els.scorecardEditActions.hidden = selectedScorecardPlayerIds.size === 0;
  renderScorecardEditControls();
}

function resetScorecardEdit() {
  scorecardEditRoute = [];
  scorecardEditTerminal = null;
}

function renderScorecardEditControls() {
  const labels = { 1: "Base 1", 2: "Base 2", 3: "Base 3", 4: "Home" };
  for (const button of document.querySelectorAll(".scorecard-route-base")) {
    const base = Number(button.dataset.base);
    const selectedIndex = scorecardEditRoute.indexOf(base);
    const lastBase = scorecardEditRoute.at(-1) ?? 0;
    const disabledByOrder = selectedIndex < 0 && (base === 4 ? lastBase === 4 : base <= lastBase);
    button.classList.toggle("selected", selectedIndex >= 0);
    button.setAttribute("aria-pressed", String(selectedIndex >= 0));
    button.disabled = selectedScorecardPlayerIds.size === 0 || disabledByOrder || Boolean(scorecardEditTerminal === "skipped");
  }
  for (const button of document.querySelectorAll(".scorecard-terminal")) {
    const isSelected = scorecardEditTerminal === button.dataset.terminal;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.disabled = selectedScorecardPlayerIds.size === 0;
  }
  const routeLabels = scorecardEditRoute.map(base => labels[base]);
  if (scorecardEditTerminal === "out") routeLabels.push("Out");
  if (scorecardEditTerminal === "skipped") routeLabels.push("Skip");
  els.scorecardRoutePreview.textContent = routeLabels.length
    ? (scorecardEditRoute.length === 1 && scorecardEditRoute[0] === 4 && !scorecardEditTerminal
      ? "Home run"
      : routeLabels.join(" → "))
    : "No bases selected";
  els.scorecardEditActions.hidden = selectedScorecardPlayerIds.size === 0;
}

function toggleScorecardRouteBase(base) {
  const index = scorecardEditRoute.indexOf(base);
  if (index >= 0) scorecardEditRoute.splice(index);
  else {
    scorecardEditTerminal = null;
    scorecardEditRoute.push(base);
  }
  renderScorecardEditControls();
}

function toggleScorecardTerminal(terminal) {
  scorecardEditTerminal = scorecardEditTerminal === terminal ? null : terminal;
  if (scorecardEditTerminal === "skipped") scorecardEditRoute = [];
  renderScorecardEditControls();
}

function editSelectedPlays() {
  const team = currentTeam();
  if (!team || !selectedScorecardPlayerIds.size) return;
  if (!scorecardEditRoute.length && !scorecardEditTerminal) {
    showScoringMessage("Select one or more bases, Out, or Skip before saving the scorecard edit.");
    return;
  }
  const inning = currentInning();
  const half = getHalf(team, inning);
  const selectedAtBats = half.atBats.filter(atBat => selectedScorecardPlayerIds.has(atBat.playerId));
  if (!selectedAtBats.length) return;
  saveUndoPoint();
  for (const atBat of selectedAtBats) {
    atBat.path = [];
    atBat.advances = [];
    atBat.advanceMeta = [];
    atBat.outNumber = null;
    if (scorecardEditTerminal === "skipped") {
      atBat.status = "skipped";
      atBat.base = null;
    } else {
      let from = 4;
      const isHomeRun = scorecardEditRoute.length === 1 && scorecardEditRoute[0] === 4;
      const route = isHomeRun ? [1, 2, 3, 4] : scorecardEditRoute;
      for (const base of route) {
        if (from === 4 && base === 4) continue;
        atBat.advances.push({ from, to: base });
        atBat.path.push(base);
        from = base;
      }
      if (isHomeRun || scorecardEditRoute.at(-1) === 4) {
        atBat.status = "run";
        atBat.base = null;
      } else if (scorecardEditTerminal === "out") {
        atBat.status = "out";
        atBat.base = null;
      } else {
        atBat.status = "onBase";
        atBat.base = scorecardEditRoute.at(-1);
      }
    }
  }
  let outNumber = 0;
  for (const atBat of half.atBats) {
    if (atBat.status === "out") atBat.outNumber = ++outNumber;
  }
  half.outs = outNumber;
  half.runs = half.atBats.filter(atBat => atBat.status === "run").length;
  updateCompletion(team, inning);
  selectedScorecardPlayerIds.clear();
  resetScorecardEdit();
  showScoringMessage("");
  persistGame();
  render();
}

function renderInningScorecard(team, inning) {
  const half = getHalf(team, inning);
  els.scorecardTeamLabel.textContent = `${team.name} · Inning ${inning}`;
  els.inningScorecard.replaceChildren();
  const playerIdsInHalf = new Set(half.atBats.map(atBat => atBat.playerId));
  for (const playerId of selectedScorecardPlayerIds) {
    if (!playerIdsInHalf.has(playerId)) selectedScorecardPlayerIds.delete(playerId);
  }
  els.scorecardEditActions.hidden = selectedScorecardPlayerIds.size === 0;
  const orderedAtBats = half.atBats.slice().sort((a, b) => {
    const playerA = getPlayer(team, a.playerId);
    const playerB = getPlayer(team, b.playerId);
    return (playerA?.order ?? 0) - (playerB?.order ?? 0);
  });
  if (!orderedAtBats.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "empty-scorecard";
    cell.textContent = "Recorded plays will appear here.";
    row.append(cell);
    els.inningScorecard.append(row);
  }
  orderedAtBats.forEach(atBat => {
    const player = getPlayer(team, atBat.playerId);
    const row = document.createElement("tr");
    const selectCell = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedScorecardPlayerIds.has(atBat.playerId);
    checkbox.setAttribute("aria-label", `Select ${player?.name ?? "player"} score to edit`);
    checkbox.addEventListener("change", () => toggleScorecardPlayer(atBat.playerId, checkbox.checked));
    selectCell.append(checkbox);
    const order = document.createElement("td");
    order.textContent = String(player?.order ?? "");
    const name = document.createElement("td");
    name.textContent = player?.name ?? "Unknown player";
    const progressCell = document.createElement("td");
    const progress = document.createElement("div");
    progress.className = "progress-dots";
    if (inning > 1 && atBat === half.atBats[0] && getInningStarter(team, inning) === atBat.playerId) {
      progress.classList.add("inning-start");
    }
    const basePoints = {
      1: [86, 50],
      2: [50, 16],
      3: [14, 50],
      4: [50, 84]
    };
    const traces = getScoringTrace(atBat);
    const visitedBases = new Set();
    traces.forEach(route => {
      const visibleRoute = route.filter((base, index) => base !== 4 || atBat.status === "run" || (index === 0 && route.length > 1));
      visibleRoute.forEach(base => visitedBases.add(base));
      for (let index = 1; index < visibleRoute.length; index += 1) {
        const from = visibleRoute[index - 1];
        const to = visibleRoute[index];
        const [fromX, fromY] = basePoints[from];
        const [toX, toY] = basePoints[to];
        const line = document.createElement("span");
        line.className = "dot-connection";
        line.setAttribute("aria-hidden", "true");
        const length = Math.hypot(toX - fromX, toY - fromY);
        const angle = Math.atan2(toY - fromY, toX - fromX);
        line.style.left = `${fromX}%`;
        line.style.top = `${fromY}%`;
        line.style.width = `${length}%`;
        line.style.transform = `rotate(${angle}rad)`;
        progress.append(line);
      }
      if (visibleRoute.length > 1) {
        const end = visibleRoute[visibleRoute.length - 1];
        const previous = visibleRoute[visibleRoute.length - 2];
        const arrow = document.createElement("span");
        arrow.className = "dot-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.style.left = `${basePoints[end][0]}%`;
        arrow.style.top = `${basePoints[end][1]}%`;
        arrow.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(basePoints[end][1] - basePoints[previous][1], basePoints[end][0] - basePoints[previous][0])}rad)`;
        arrow.title = `Stopped at ${BASE_NAMES[end]}`;
        progress.append(arrow);
      }
    });
    for (const base of visitedBases) {
      const dot = document.createElement("i");
      dot.className = "base-dot";
      dot.dataset.base = String(base);
      dot.title = `${BASE_NAMES[base]} base`;
      dot.setAttribute("aria-label", `${BASE_NAMES[base]} base`);
      dot.style.left = `${basePoints[base][0]}%`;
      dot.style.top = `${basePoints[base][1]}%`;
      progress.append(dot);
    }
    if (atBat.status === "run") progress.classList.add("scored");
    if (atBat.status === "out") progress.dataset.out = String(atBat.outNumber);
    progressCell.append(progress);
    const result = document.createElement("td");
    const tag = document.createElement("span");
    tag.className = `result-tag${atBat.status === "out" ? " out" : atBat.status === "run" ? " run" : atBat.status === "skipped" ? " skipped" : ""}`;
    tag.textContent = atBat.status === "out" ? `Out ${atBat.outNumber}` : atBat.status === "run" ? "Run" : atBat.status === "skipped" ? "Skipped" : `On ${BASE_NAMES[atBat.base]}`;
    result.append(tag);
    row.append(selectCell, order, name, progressCell, result);
    els.inningScorecard.append(row);
  });
}

function renderScoring() {
  const team = currentTeam();
  if (!team) return;
  const inning = currentInning();
  const completionMessage = inningCompletionMessage(team, inning);
  if (completionMessage && !els.scoringMessage.classList.contains("success")) {
    showScoringMessage(completionMessage);
  }
  renderLineup(team, inning);
  renderDiamond(team, inning);
  renderInningSummary(team, inning);
  renderInningScorecard(team, inning);
  const half = getHalf(team, inning);
  const selectedAtBat = selectedPlayerId ? getAtBat(team, inning, selectedPlayerId) : null;
  els.diamondOut.disabled = half.ended || (isHalfComplete(team, inning) && selectedAtBat?.status !== "skipped");
  els.diamondOut.title = els.diamondOut.disabled
    ? inningCompletionMessage(team, inning)
    : "Record the selected player, or next batter, as out";
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
  els.lineupContent.hidden = lineupCollapsed;
  els.toggleLineup.textContent = lineupCollapsed ? "Show batting order" : "Hide batting order";
  els.toggleLineup.setAttribute("aria-expanded", String(!lineupCollapsed));
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

function openDialog(dialog) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
    return;
  }
  dialog.classList.add("dialog-fallback");
  dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  dialog.classList.remove("dialog-fallback");
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

  const traces = getScoringTrace(atBat)
    .map(route => route.filter((base, index) => base !== 4 || atBat.status === "run" || (index === 0 && route.length > 1)))
    .filter(route => route.length);
  const visitedBases = new Set();
  const arrowHeads = [];
  ctx.fillStyle = "#111";
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 2;
  for (const route of traces) {
    route.forEach(base => visitedBases.add(base));
    for (let index = 1; index < route.length; index += 1) {
      const [fromX, fromY] = points[route[index - 1]];
      const [toX, toY] = points[route[index]];
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();
      if (index === route.length - 1) arrowHeads.push({ x: toX, y: toY, angle });
    }
  }
  for (const base of visitedBases) {
    const [px, py] = points[base];
    ctx.beginPath();
    ctx.arc(px, py, Math.max(2.5, size * .045), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const { x: toX, y: toY, angle } of arrowHeads) {
    const arrowSize = Math.max(4, size * .08);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - arrowSize * Math.cos(angle - Math.PI / 6), toY - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - arrowSize * Math.cos(angle + Math.PI / 6), toY - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }
  if (atBat.status === "run") {
    ctx.fillStyle = "#25834a";
    ctx.beginPath();
    ctx.arc(center, middle, size * .16, 0, Math.PI * 2);
    ctx.fill();
  } else if (atBat.status === "out") {
    ctx.fillStyle = "#bf4038";
    ctx.beginPath();
    ctx.arc(center, middle, size * .16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
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
        if (player && inning > 1 && inning <= game.innings && getInningStarter(team, inning) === player.id) {
          const atBatInCurrentInning = getAtBat(team, inning, player.id);
          if (!atBatInCurrentInning) continue;

          const previousInningCellX = inningsX + (inning - 2) * inningWidth;
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 4;
          ctx.beginPath();
          // Crossover line in the previous inning box: bottom-left to top-right
          ctx.moveTo(previousInningCellX, rowY + rowHeight);
          ctx.lineTo(previousInningCellX + inningWidth, rowY);
          ctx.stroke();
          ctx.beginPath();
          // Continuity line in the current inning box: top-left to top-right
          ctx.moveTo(cellX, rowY);
          ctx.lineTo(cellX + inningWidth, rowY);
          ctx.stroke();
        }
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
  openDialog(els.scorecardPreview);
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

function showUserManual(context = "") {
  openDialog(els.userManual);
}

function showContextHelp(button) {
  els.infoDialogTitle.textContent = button.getAttribute("aria-label").replace(/^More information about\s+/i, "");
  els.infoDialogMessage.textContent = button.dataset.help;
  openDialog(els.infoDialog);
}

function populateSetupFromQR(data) {
  if (!data || typeof data !== "object") return;

  els.gameName.value = data.n ?? "";
  els.gameDate.value = data.d ?? "";
  els.gameGround.value = data.g ?? "";
  els.inningsCount.value = String(data.i ?? 12);
  els.playersPerInning.value = String(data.p ?? 9);
  els.outsPerInning.value = String(data.o ?? 3);

  if (data.h) {
    els.homeName.value = data.h.n ?? "Home Team";
    setupRosters.home = data.h.p ?? [];
    updateSetupLineup("home");
  }

  if (data.a) {
    els.awayName.value = data.a.n ?? "Away Team";
    setupRosters.away = data.a.p ?? [];
    updateSetupLineup("away");
  }
}

function generateQR() {
  console.log("generateQR function called");
  try {
    const data = {
      v: 1,
      n: els.gameName.value.trim(),
      d: els.gameDate.value,
      g: els.gameGround.value.trim(),
      i: Number(els.inningsCount.value),
      p: Number(els.playersPerInning.value),
      o: Number(els.outsPerInning.value),
      h: {
        n: els.homeName.value.trim(),
        p: setupRosters.home
      },
      a: {
        n: els.awayName.value.trim(),
        p: setupRosters.away
      }
    };
    console.log("Data collected for QR:", data);

    const container = document.querySelector("#qr-code-container");
    if (!container) {
      console.error("QR container not found in DOM");
      return;
    }

    container.innerHTML = "";
    console.log("Attempting to instantiate QRCode...");

    if (typeof QRCode === 'undefined') {
      console.error("QRCode library is not loaded!");
      showScoringMessage("QR library not loaded. Please refresh the page.");
      return;
    }

    new QRCode(container, {
      text: JSON.stringify(data),
      width: 256,
      height: 256,
      colorDark: "#111",
      colorLight: "#fff",
      correctLevel: QRCode.CorrectLevel.L
    });

    console.log("QR code rendered successfully");
    openDialog(els.qrGenerateDialog);
  } catch (error) {
    console.error("Error generating QR code:", error);
    showScoringMessage("An error occurred while generating the QR code.");
  }
}

function startScanner() {
  console.log("startScanner function called");
  openDialog(els.qrScanDialog);
  const html5QrCode = new Html5Qrcode("qr-reader");

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      console.log("QR Code scanned successfully:", decodedText);
      try {
        const data = JSON.parse(decodedText);
        console.log("Parsed QR data:", data);
        populateSetupFromQR(data);
        html5QrCode.stop().then(() => {
          console.log("Scanner stopped after successful scan");
          closeDialog(els.qrScanDialog);
        });
      } catch (e) {
        console.error("Invalid QR data format:", e);
        showScoringMessage("The QR code contains invalid data.");
      }
    },
    (errorMessage) => {
      // We don't log every frame's failure, but we can log occasionally
      // or just leave it quiet as it's very noisy.
    }
  ).then(() => {
    console.log("Camera started successfully");
  }).catch(err => {
    console.error("Camera error during start:", err);
    showScoringMessage("Camera access denied or not available.");
  });

  // Store the scanner instance to stop it when dialog closes
  els.activeScanner = html5QrCode;
}

function bindEvents() {
  els.startGame.addEventListener("click", saveSetup);
  els.homeTeamChoice.addEventListener("change", () => chooseSetupTeam("home", els.homeTeamChoice.value));
  els.awayTeamChoice.addEventListener("change", () => chooseSetupTeam("away", els.awayTeamChoice.value));
  els.addHomePlayer.addEventListener("click", () => addSetupPlayer("home"));
  els.addAwayPlayer.addEventListener("click", () => addSetupPlayer("away"));
  els.addPlayer.addEventListener("click", addPlayerToCurrentTeam);
  els.newPlayerName.addEventListener("keydown", event => {
    if (event.key === "Enter") addPlayerToCurrentTeam();
  });
  els.endInning.addEventListener("click", endHalfInning);
  for (const button of document.querySelectorAll(".scorecard-route-base")) {
    button.addEventListener("click", () => toggleScorecardRouteBase(Number(button.dataset.base)));
  }
  for (const button of document.querySelectorAll(".scorecard-terminal")) {
    button.addEventListener("click", () => toggleScorecardTerminal(button.dataset.terminal));
  }
  document.querySelector("#save-scorecard-edit").addEventListener("click", editSelectedPlays);
  document.querySelector("#cancel-scorecard-edit").addEventListener("click", () => {
    selectedScorecardPlayerIds.clear();
    resetScorecardEdit();
    showScoringMessage("");
    renderScoring();
  });
  els.toggleSetup.addEventListener("click", () => {
    setupCollapsed = !setupCollapsed;
    render();
  });
  els.toggleLineup.addEventListener("click", () => {
    lineupCollapsed = !lineupCollapsed;
    render();
  });
  document.querySelector("#generate-qr").addEventListener("click", generateQR);
  document.querySelector("#scan-qr").addEventListener("click", startScanner);
  els.battingTeam.addEventListener("change", () => {
    selectedPlayerId = null;
    selectedScorecardPlayerIds.clear();
    resetScorecardEdit();
    showScoringMessage("");
    renderScoring();
  });
  els.inningSelect.addEventListener("change", () => {
    selectedPlayerId = null;
    selectedScorecardPlayerIds.clear();
    resetScorecardEdit();
    showScoringMessage("");
    renderScoring();
  });
  els.diamondOut.addEventListener("click", () => recordOut());
  els.undoLastAction.addEventListener("click", undoLastAction);
  els.redoAction.addEventListener("click", redoAction);
  els.viewScorecard.addEventListener("click", showScorecardPreview);
  els.closeScorecardPreview.addEventListener("click", () => closeDialog(els.scorecardPreview));
  els.openManual.addEventListener("click", () => showUserManual());
  els.closeManual.addEventListener("click", () => closeDialog(els.userManual));
  els.closeInfoDialog.addEventListener("click", () => closeDialog(els.infoDialog));
  els.cancelConfirm.addEventListener("click", () => resolveConfirmation(false));
  els.acceptConfirm.addEventListener("click", () => resolveConfirmation(true));
  els.confirmDialog.addEventListener("cancel", event => {
    event.preventDefault();
    resolveConfirmation(false);
  });
  for (const button of document.querySelectorAll?.(".info-button") ?? []) {
    button.addEventListener("click", event => {
      event.preventDefault();
      showContextHelp(button);
    });
  }
  els.exportJson.addEventListener("click", exportJson);
  els.exportImage.addEventListener("click", exportImage);
  els.closeQrGenerate.addEventListener("click", () => closeDialog(els.qrGenerateDialog));
  els.closeQrScan.addEventListener("click", () => {
    if (els.activeScanner) {
      els.activeScanner.stop().then(() => {
        closeDialog(els.qrScanDialog);
      }).catch(err => {
        console.error("Error stopping scanner:", err);
        closeDialog(els.qrScanDialog);
      });
      els.activeScanner = null;
    } else {
      closeDialog(els.qrScanDialog);
    }
  });
  for (const base of els.diamond.querySelectorAll(".base[data-base]")) {
    const handleBaseSelection = () => {
      const team = currentTeam();
      const inning = currentInning();
      const occupiedId = getOccupied(team, inning).get(Number(base.dataset.base));
      if (occupiedId) {
        selectPlayer(occupiedId);
      } else if (selectedPlayerId) {
        recordBase(selectedPlayerId, Number(base.dataset.base));
      }
    };
    base.addEventListener("click", handleBaseSelection);
    base.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleBaseSelection();
      }
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
  window.addEventListener?.("resize", () => {
    if (!game) return;
    render();
  });
  window.addEventListener?.("keydown", event => {
    if (event.key !== "Escape") return;
    for (const dialog of [els.userManual, els.infoDialog, els.confirmDialog, els.scorecardPreview]) {
      if (dialog.classList.contains("dialog-fallback")) {
        if (dialog === els.confirmDialog) resolveConfirmation(false);
        else closeDialog(dialog);
      }
    }
  });
}

function populateSetupFromGame() {
  populateTeamChoices();
  if (!game) {
    els.gameDate.value = new Date().toISOString().slice(0, 10);
    els.inningsCount.value = "12";
    els.playersPerInning.value = "9";
    els.outsPerInning.value = "3";
    setupRosters.home = [];
    setupRosters.away = [];
    els.homeTeamChoice.value = "";
    els.awayTeamChoice.value = "";
    updateSetupLineup("home");
    updateSetupLineup("away");
    return;
  }
  els.gameName.value = game.name ?? "";
  els.gameDate.value = game.date || new Date().toISOString().slice(0, 10);
  els.gameGround.value = game.ground ?? "";
  els.inningsCount.value = String(game.innings);
  els.playersPerInning.value = String(game.playersPerInning ?? 9);
  els.outsPerInning.value = String(game.outsPerInning ?? 3);
  els.homeName.value = game.teams[0].name;
  els.awayName.value = game.teams[1].name;
  setupRosters.home = game.teams[0].players.map(player => player.name);
  setupRosters.away = game.teams[1].players.map(player => player.name);
  els.homeTeamChoice.value = matchStaticTeam(game.teams[0].name, setupRosters.home)?.id ?? "";
  els.awayTeamChoice.value = matchStaticTeam(game.teams[1].name, setupRosters.away)?.id ?? "";
  updateSetupLineup("home");
  updateSetupLineup("away");
}

bindEvents();
populateSetupFromGame();
render();
