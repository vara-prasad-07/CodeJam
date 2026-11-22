"""Refresh the public listing total; acquisition analytics require the publisher dashboard."""
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,re,urllib.request

path=Path(__file__).parent/'public/data/marketplace.json'
data=json.loads(path.read_text(encoding='utf-8'))
request=urllib.request.Request(data['source'],headers={'User-Agent':'Mozilla/5.0'})
with urllib.request.urlopen(request,timeout=30) as response:
    html=response.read().decode('utf-8')
match=re.search(r'class="installs-text"[^>]*>\s*([\d,]+)\s+installs',html)
if not match:
    raise SystemExit('Public install count not found. Existing snapshot was preserved.')
data['installs']=int(match.group(1).replace(',',''))
data['asOf']=datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()
path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
print(f"Updated public installs: {data['installs']} ({data['asOf']}). Exported daily report preserved. Rebuild to refresh the site.")
