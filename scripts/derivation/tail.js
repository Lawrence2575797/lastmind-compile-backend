  function startStage(n) {
    stageIdx = n; idx = -1; setHeld(0);
    stageTitle.textContent = STAGES[n].hud;
    var empty = document.getElementById('trayEmpty'); if (empty) empty.remove();
    tray.appendChild(el('b', 'stagemark', 'Stage ' + (n + 1)));
    next(true);
  }
  function restart() {
    feed.innerHTML = ''; tray.innerHTML = '<b>Key terms</b><span class="hint" id="trayEmpty">they collect here as you go</span>';
    collected = []; completed = 0; stageIdx = 0; idx = -1; setHeld(0); stageTitle.textContent = STAGES[0].hud;
    next(false); feed.scrollTo({ top: 0 });
  }

  var rules = document.getElementById('rules');
  document.getElementById('howBtn').addEventListener('click', function () { rules.hidden = false; document.getElementById('rulesClose').focus(); });
  document.getElementById('rulesClose').addEventListener('click', function () { rules.hidden = true; });
  rules.addEventListener('click', function (e) { if (e.target === rules) rules.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') rules.hidden = true; });
  document.getElementById('againBtn').addEventListener('click', restart);

  stageTitle.textContent = STAGES[0].hud;
  setHeld(0); next(false);
})();
