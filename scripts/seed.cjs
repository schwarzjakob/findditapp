#!/usr/bin/env node
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "nodenext",
  moduleResolution: "nodenext",
});
require("ts-node/register/transpile-only");
require("tsconfig-paths/register");
require("./seed-runner.ts");
