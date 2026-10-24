// Loaded last: every game module has registered itself in ENG, so the hub can draw.
// Points caps chosen earlier on this device (see capInput in app.js).
for (const [g, e] of Object.entries(ENG)) for (const k of Object.keys(e.cfg || {})){ const v = store.get(`cap-${g}-${k}`); if (Number.isInteger(v)) e.cfg[k] = v; }
booted = true;
render();
