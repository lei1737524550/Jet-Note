from pathlib import Path
import re,json,xml.etree.ElementTree as ET
root=Path(__file__).resolve().parents[1]
a=root/'app/src/main/assets'
errors=[];checked=set()
for p in a.rglob('*'):
 if p.suffix not in {'.js','.html','.css','.json'}:continue
 text=p.read_text()
 if p.suffix=='.json':json.loads(text)
 for m in re.finditer(r'''["'`](?:/assets/)?((?:src/|Language/|config/)[A-Za-z0-9_./-]+\.(?:js|json|html|css|svg|ogg))(?:\?[^"'`\s]*)?["'`]''',text):
  target=m.group(1);checked.add(target)
  if target.startswith('config/'):
   continue  # served virtually by RuntimeConfigStore / LocalResourceRouter
  if not (a/target).is_file():errors.append(f'{p.relative_to(a)} -> {target}')
for p in (root/'app/src/main').rglob('*.xml'):ET.parse(p)
for p in (root/'app/src/main/kotlin').rglob('*'):
 if p.suffix not in {'.kt','.java'}:continue
 for asset in re.findall(r'assets\.open\("([^"]+)"\)',p.read_text()):
  if not (a/asset).is_file():errors.append(f'{p.name} -> {asset}')
assert not errors,'\n'.join(errors)
print(f'PASS: {len(checked)} literal asset targets, JSON and Android XML')
