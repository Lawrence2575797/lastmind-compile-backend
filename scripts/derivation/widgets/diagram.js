  /* ---- a small economics diagram, drawn from data: labelled axes, up to three curves through given points, labelled points, dashed guides.
     Coordinates are 0 to 1 on both axes. Used by any question that carries a "diagram". ---- */
  function diagramEl(d) {
    var box = el('div', 'svgwrap'), svg = document.createElementNS(NS, 'svg'), ox = 70, oy = 340, W = 430, H = 290;
    box.appendChild(svg); svg.setAttribute('viewBox', '0 0 560 400'); svg.setAttribute('class', 'dia');
    function px(x, y) { return [ox + W * x, oy - H * y]; }
    for (var i = 1; i <= 4; i++) {
      svgEl('line', { x1: ox, x2: ox + W + 20, y1: oy - (H / 4) * i, y2: oy - (H / 4) * i, class: 'dgrid' }, svg);
      svgEl('line', { y1: oy, y2: oy - H - 20, x1: ox + (W / 4) * i, x2: ox + (W / 4) * i, class: 'dgrid' }, svg);
    }
    svgEl('line', { x1: ox, y1: oy, x2: ox + W + 34, y2: oy, class: 'dax' }, svg);
    svgEl('line', { x1: ox, y1: oy, x2: ox, y2: oy - H - 34, class: 'dax' }, svg);
    var xl = svgEl('text', { x: ox + W / 2, y: oy + 44, class: 'dlab', 'text-anchor': 'middle' }, svg); xl.textContent = d.x;
    var yl = svgEl('text', { x: 22, y: oy - H / 2, class: 'dlab', 'text-anchor': 'middle', transform: 'rotate(-90 22 ' + (oy - H / 2) + ')' }, svg); yl.textContent = d.y;
    function smooth(pts) {
      var p = pts.map(function (q) { return px(q[0], q[1]); });
      if (p.length === 2) return 'M' + p[0][0] + ',' + p[0][1] + 'L' + p[1][0] + ',' + p[1][1];
      var s = 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
      for (var k = 0; k < p.length - 1; k++) {
        var a = p[k - 1] || p[k], b = p[k], c = p[k + 1], e = p[k + 2] || c;
        s += 'C' + (b[0] + (c[0] - a[0]) / 6).toFixed(1) + ',' + (b[1] + (c[1] - a[1]) / 6).toFixed(1) + ' ' + (c[0] - (e[0] - b[0]) / 6).toFixed(1) + ',' + (c[1] - (e[1] - b[1]) / 6).toFixed(1) + ' ' + c[0].toFixed(1) + ',' + c[1].toFixed(1);
      }
      return s;
    }
    (d.curves || []).forEach(function (c, i) {
      var path = svgEl('path', { d: smooth(c.pts), class: 'dcurve' + (i ? ' mine' : '') }, svg);
      if (c.dashed) path.setAttribute('stroke-dasharray', '9 7');
      var end = px(c.pts[c.pts.length - 1][0], c.pts[c.pts.length - 1][1]);
      var t = svgEl('text', { x: end[0] + 8, y: end[1] - 8, class: 'dlab' }, svg); t.textContent = c.label;
    });
    (d.points || []).forEach(function (p) {
      var q = px(p.x, p.y);
      if (p.guides) {
        svgEl('line', { x1: ox, y1: q[1], x2: q[0], y2: q[1], class: 'dgrid', 'stroke-dasharray': '5 5', style: 'stroke: var(--muted)' }, svg);
        svgEl('line', { x1: q[0], y1: oy, x2: q[0], y2: q[1], class: 'dgrid', 'stroke-dasharray': '5 5', style: 'stroke: var(--muted)' }, svg);
      }
      var g = svgEl('g', { class: 'dpt ' + (p.style || '') }, svg);
      svgEl('circle', { cx: q[0], cy: q[1], r: 7 }, g);
      var t = svgEl('text', { x: q[0] + 14, y: q[1] - 10, class: 'dlab' }, g); t.textContent = p.label;
    });
    return box;
  }
