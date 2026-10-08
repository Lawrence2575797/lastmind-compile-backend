'use strict';

// Hand-written content for the Italian course, one entry per map node. Two shapes are enough for almost everything:
//   V('lunedì=Monday; martedì=Tuesday', ['A note line.'])   a lesson that teaches words: each one is given with its meaning, and the check asks
//                                                            "How do you say “Monday” in Italian?" and types the answer
//   R(['Teaching line.', ...], [['Question?', 'Right', 'Wrong 1', 'Wrong 2']])   a lesson about how the language works: plain explanation,
//                                                            then simple multiple-choice questions
// Either can carry extras: V(pairs, notes, { quiz: [...], say: [[q, answer], ...], max: 3 }).

const parsePairs = (text) => text.split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
  const i = p.indexOf('=');
  if (i < 0) throw new Error(`bad vocab pair: ${p}`);
  const it = p.slice(0, i).trim();
  const en = p.slice(i + 1).trim();
  return { it, en };
});

const V = (pairs, notes = [], extra = {}) => ({ vocab: parsePairs(pairs), notes, ...extra });
const R = (teach, quiz = [], extra = {}) => ({ teach, quiz, ...extra });

module.exports = { V, R, parsePairs };
