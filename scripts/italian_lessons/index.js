'use strict';

// Every file in this folder (except helpers and this one) exports { nodeId: lesson }; they are merged here.
const fs = require('fs');
const path = require('path');

const specs = {};
fs.readdirSync(__dirname)
  .filter((f) => /^s\d+.*\.js$/.test(f))
  .sort()
  .forEach((f) => {
    const part = require(path.join(__dirname, f));
    Object.keys(part).forEach((id) => {
      if (specs[id]) throw new Error(`${id} is written twice (${f})`);
      specs[id] = part[id];
    });
  });

module.exports = specs;
