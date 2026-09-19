"use strict";

// node_modules/@openflow/desktop/dist/preload.js
var import_electron = require("electron");
function expose(api) {
  import_electron.contextBridge.exposeInMainWorld("openflow", api);
}
function flag(name) {
  const prefix = `--openflow-${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? "";
}

// set/electron/preload.ts
expose({ bridge: flag("bridge") });
