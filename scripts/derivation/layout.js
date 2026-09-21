'use strict';
// Auto-layout for a derivation graph: layered left to right from the edges.
// Returns nodes as [x, y, w, h] and edges as polylines, in the engine's 1040-wide space.
// A spec may pin any term with layout: { term: [col, row] }; the rest are placed by rank.

const W = 1040, PAD = 40, ROW = 90;

function sizeOf(label) {
  const len = label.length;
  const w = Math.max(130, Math.min(230, Math.round(len * 8.5 + 28)));
  return [w, len > 22 ? 64 : 56];
}

function layout(keys, edges, labels, pins) {
  pins = pins || {};
  const rank = {};
  keys.forEach((k) => { rank[k] = 0; });
  for (let pass = 0; pass < keys.length; pass++) {
    edges.forEach(([a, b]) => { if (rank[b] < rank[a] + 1) rank[b] = rank[a] + 1; });
  }
  const col = {}, row = {}, band = {};
  const sizes = {};
  keys.forEach((k) => { sizes[k] = sizeOf(labels[k]); });
  const maxRank = Math.max(...keys.map((k) => rank[k]));
  const pinned = (k) => !!pins[k];
  // fold long chains into bands so the graph always fits the width: the widest column count that leaves a gap of at least 30
  const fits = (M) => {
    const cw = [];
    keys.forEach((k) => { if (!pinned(k)) cw[rank[k] % M] = Math.max(cw[rank[k] % M] || 0, sizes[k][0]); });
    const used = cw.filter((v) => v).length;
    return used <= 1 || (W - 2 * PAD - cw.reduce((s, v) => s + (v || 0), 0)) / (used - 1) >= 30;
  };
  let M = maxRank + 1;
  while (M > 1 && !fits(M)) M--;
  keys.forEach((k) => { if (pinned(k)) { col[k] = pins[k][0]; row[k] = pins[k][1]; band[k] = 0; } else { col[k] = rank[k] % M; band[k] = Math.floor(rank[k] / M); } });
  const cells = {};
  keys.forEach((k) => { if (!pinned(k)) { const id = band[k] + ':' + col[k]; (cells[id] = cells[id] || []).push(k); } });
  const nBands = Math.max(0, ...keys.filter((k) => !pinned(k)).map((k) => band[k])) + 1;
  const bandRows = [];
  const parentRow = (k) => {
    const ps = edges.filter((e) => e[1] === k && row[e[0]] != null && band[e[0]] === band[k]).map((e) => row[e[0]]);
    return ps.length ? ps.reduce((s, v) => s + v, 0) / ps.length : 0;
  };
  let offset = 0;
  for (let bd = 0; bd < nBands; bd++) {
    let used = 0;
    for (let c = 0; c < M; c++) {
      const list = (cells[bd + ':' + c] || []).sort((x, y) => parentRow(x) - parentRow(y));
      const taken = new Set();
      list.forEach((k) => { let r = Math.round(parentRow(k) - offset); r = Math.max(0, r); while (taken.has(r)) r++; row[k] = offset + r; taken.add(r); used = Math.max(used, r + 1); });
    }
    offset += Math.max(used, 1);
  }
  const nCols = Math.max(...keys.map((k) => col[k])) + 1;
  const nRows = Math.max(...keys.map((k) => row[k])) + 1;
  const colW = [], colX = [];
  for (let c = 0; c < nCols; c++) colW[c] = Math.max(0, ...keys.filter((k) => col[k] === c).map((k) => sizes[k][0]));
  const gap = nCols > 1 ? (W - 2 * PAD - colW.reduce((s, v) => s + v, 0)) / (nCols - 1) : 0;
  if (nCols > 1 && gap < 30) throw new Error(`Graph is too wide (${nCols} columns): pin some terms with "layout" to stack them`);
  let x0 = nCols > 1 ? PAD : (W - colW[0]) / 2;
  for (let c = 0; c < nCols; c++) { colX[c] = x0; x0 += colW[c] + gap; }
  const nodes = {};
  keys.forEach((k) => { nodes[k] = [Math.round(colX[col[k]]), PAD + row[k] * ROW, sizes[k][0], sizes[k][1]]; });
  const h = PAD * 2 + (nRows - 1) * ROW + 64;

  // edge routing
  const elbow = {};
  const inN = {}, outN = {}, inI = {}, outI = {};
  edges.forEach(([a, b]) => { outN[a] = (outN[a] || 0) + 1; inN[b] = (inN[b] || 0) + 1; });
  const spread = (n, i) => (i - (n - 1) / 2) * 12;
  const routed = edges.map(([a, b]) => {
    const A = nodes[a], B = nodes[b];
    outI[a] = (outI[a] || 0); inI[b] = (inI[b] || 0);
    const oy = spread(outN[a], outI[a]++), iy = spread(inN[b], inI[b]++);
    if (col[a] === col[b]) { // same column: straight down (or up) the middle
      const x = A[0] + A[2] / 2;
      return B[1] > A[1] ? [[x, A[1] + A[3]], [x, B[1]]] : [[x, A[1]], [x, B[1] + B[3]]];
    }
    if (col[b] < col[a] || (row[b] > row[a] && col[b] <= col[a])) { // folded chain: down, across, down
      const x1 = A[0] + A[2] / 2 + oy, x2 = B[0] + B[2] / 2 + iy, ym = Math.round((A[1] + A[3] + B[1]) / 2);
      return [[x1, A[1] + A[3]], [x1, ym], [x2, ym], [x2, B[1]]];
    }
    const sx = A[0] + A[2], sy = A[1] + A[3] / 2 + oy, tx = B[0], ty = B[1] + B[3] / 2 + iy;
    const blocked = keys.some((k) => k !== a && k !== b && col[k] > col[a] && col[k] < col[b] && row[k] === row[a]);
    if (blocked) { // skip over the blocking nodes through the gap under the row
      const gap = Math.max(A[1] + A[3], B[1] + B[3]) + 22 + (outI[a] - 1) * 8;
      return [[A[0] + A[2] / 2 + oy, A[1] + A[3]], [A[0] + A[2] / 2 + oy, gap], [B[0] + B[2] / 2 + iy, gap], [B[0] + B[2] / 2 + iy, B[1] + B[3]]];
    }
    if (Math.abs(sy - ty) < 1) return [[sx, sy], [tx, ty]];
    const k = (elbow[col[b] + ":" + band[b]] = (elbow[col[b] + ":" + band[b]] || 0) + 1) - 1;
    const mid = Math.round(tx - Math.min(18 + 12 * k, Math.max(8, (tx - sx) - 8)));
    return [[sx, sy], [mid, sy], [mid, ty], [tx, ty]];
  }).map((pts) => pts.map((p) => [Math.round(p[0]), Math.round(p[1])]));
  return { h, nodes, edges: routed };
}

module.exports = { layout };
