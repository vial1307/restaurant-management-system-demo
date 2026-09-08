from pathlib import Path

auth_path = Path("src/auth-layer.js")
source = auth_path.read_text(encoding="utf-8")
old = "    if (Array.isArray(saved) && saved.length) return saved;\n"
new = "    if (Array.isArray(saved)) return saved;\n"
if source.count(old) != 1:
    raise SystemExit(f"central cache guard anchor count={source.count(old)}")
auth_path.write_text(source.replace(old, new), encoding="utf-8")

perf_path = Path("tests/performance-regression.mjs")
perf = perf_path.read_text(encoding="utf-8")
line = 'await import("./central-empty-cache-reseed-contract-regression.mjs");\n'
if line not in perf:
    perf += line
perf_path.write_text(perf, encoding="utf-8")
