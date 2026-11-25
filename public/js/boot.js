// Loaded last: every game module has registered itself in ENG, so the hub can draw.
// Points caps chosen earlier on this device (see capInput in app.js).
for (const [g, e] of Object.entries(ENG)) for (const k of Object.keys(e.cfg || {})){ const v = store.get(`cap-${g}-${k}`); if (Number.isInteger(v)) e.cfg[k] = v; }
// A site that runs one game opens straight on it.
if (SITE.only && ENG[SITE.only]){ GID = SITE.only; screen = 'home'; document.title = `${ENG[SITE.only].name} · Playroom`; }
// Arriving from the other site: keep the name, and join the table if a code came along.
{
  const q = new URLSearchParams(location.search), name = q.get('name'), code = q.get('join');
  if (name && !form.name.trim()){ form.name = name.slice(0, 18); store.set('dm-name', form.name); }
  if (q.has('name') || q.has('join')) history.replaceState(null, '', location.pathname);
  if (code) PlayNet.connect().then(() => joinTable(code)).catch(() => {});
}
booted = true;
render();
