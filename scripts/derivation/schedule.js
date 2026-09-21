  /* ---- the schedule: what is done, what is ready, what is waiting on a prerequisite ---- */
  function fmtDate(offset) { return new Date(Date.now() + offset * DAY).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
  function known(key) { return collected.indexOf(key) > -1; }
  function scheduleHtml() {
    var rows = PLAN.map(function (p, i) {
      var done = completed > i && i < STAGES.length, ready = !done && p.needs.every(known);
      var pill = done ? '<span class="pill good">Done</span>' : ready ? '<span class="pill now">Ready now</span>' : '<span class="pill">Waiting</span>';
      var needs = p.needs.length ? p.needs.map(function (n) { return '<span class="need ' + (known(n) ? 'met' : '') + '">' + (known(n) ? '✓ ' : '· ') + TERMS[n].t + '</span>'; }).join('') : '<span class="need met">no prerequisites</span>';
      var rev = done ? '<div class="rev">Recall checks: ' + fmtDate(1) + ' · ' + fmtDate(3) + ' · ' + fmtDate(7) + '</div>' : '';
      return '<div class="row"><div class="rowtop"><b>' + p.name + '</b>' + pill + '</div><div class="needs">Needs: ' + needs + '</div>' + rev + '</div>';
    }).join('');
    return '<div class="schedule"><div class="eyebrow">Schedule</div>' + rows + '<div class="hint">A stage opens only when every direct prerequisite is met. Chains can be taken in any order.</div></div>';
  }

