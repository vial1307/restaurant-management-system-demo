from pathlib import Path

path = Path(__file__).resolve().parents[1] / "tests/performance-regression-core.mjs"
text = path.read_text(encoding="utf-8")
old = '''assert.equal((app.match(/const receiveResult = await cloudSetReceiveDefault/g) || []).length, 2, "both product create/edit flows must verify receive-default persistence");
assert.match(app, /if \\(!receiveResult\\.ok\\) \\{[\\s\\S]{0,500}window\\.alert/, "receive-default persistence failures must be visible instead of silently reporting a complete save");'''
new = '''assert.equal((app.match(/const receiveResult = canManageReceiveDefault\\(site\\)/g) || []).length, 2, "both product create/edit flows must apply receiving-default ownership before persistence");
assert.equal((app.match(/\\? await cloudSetReceiveDefault\\(\\{/g) || []).length, 2, "authorized product create/edit flows must still persist receiving-default configuration");
assert.equal((app.match(/: \\{ok:true,skipped:true\\};/g) || []).length, 2, "unauthorized catalog saves must skip receiving-default writes without reporting a persistence failure");
assert.match(app, /if \\(!receiveResult\\.ok\\) \\{[\\s\\S]{0,500}window\\.alert/, "receive-default persistence failures must be visible instead of silently reporting a complete save");'''
count = text.count(old)
if count != 1:
    raise RuntimeError(f"expected one performance guard anchor, found {count}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("receiving-default performance guard updated")
