from pathlib import Path

inventory_path = Path("src/inventory-cloud.js")
source = inventory_path.read_text(encoding="utf-8")
old = "      vpsInventoryHistory(site, limit),\n"
new = "      vpsInventoryHistory(site, { limit }),\n"
if source.count(old) != 1:
    raise SystemExit(f"history call anchor count={source.count(old)}")
inventory_path.write_text(source.replace(old, new), encoding="utf-8")

perf_path = Path("tests/performance-regression.mjs")
perf = perf_path.read_text(encoding="utf-8")
line = 'await import("./inventory-history-limit-contract-regression.mjs");\n'
if line not in perf:
    perf += line
perf_path.write_text(perf, encoding="utf-8")
