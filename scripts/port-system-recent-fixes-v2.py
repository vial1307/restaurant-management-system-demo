from pathlib import Path

script_path = Path(__file__).with_name("port-system-recent-fixes.py")
source = script_path.read_text(encoding="utf-8")
source = source.replace(r'history: \"已儲存日期\"', r'history: \"歷史紀錄\"')
exec(compile(source, str(script_path), "exec"), {"__name__": "__main__", "__file__": str(script_path)})
