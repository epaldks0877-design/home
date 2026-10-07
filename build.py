"""Build a static allowlist, excluding prompts, secrets, QA and browser profiles."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent
target = root / 'dist'
target.mkdir(exist_ok=True)
files = ['index.html', 'styles.css', 'theme-dark.css', 'app.js', 'inquiry-delivery.js', 'catalog.js', 'catalog.css', '_headers', '_routes.json']
files += ['admin/index.html', 'admin/admin.css', 'admin/admin.js']
files += ['assets/' + name for name in ['favicon.svg', 'materials-studio.png', 'service-profile.png', 'service-plastic.png']]
existing = {p.relative_to(target).as_posix() for p in target.rglob('*') if p.is_file()}
unexpected = existing - set(files)
if unexpected:
    raise SystemExit(f'Unexpected files in dist; inspect before deployment: {sorted(unexpected)}')
for name in files:
    source, destination = root / name, target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
print(f'Built {len(files)} public files in {target}')
