"""Import the publisher's XLSX export without changing the original workbook."""
from pathlib import Path
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime

root = Path(__file__).resolve().parent
report = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'public/data/CodeJam.codejam-workspace-report.xlsx'
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(report) as archive:
    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    strings = []
    if 'xl/sharedStrings.xml' in archive.namelist():
        strings = [''.join(el.itertext()) for el in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', ns)]
    rows = []
    for row in sheet.findall('.//s:sheetData/s:row', ns):
        values = []
        for cell in row.findall('s:c', ns):
            value = cell.find('s:v', ns)
            text = value.text if value is not None else ''.join(cell.find('s:is', ns).itertext()) if cell.find('s:is', ns) is not None else ''
            values.append(strings[int(text)] if cell.get('t') == 's' else text)
        rows.append(values)
headers = rows[0]
date_col = headers.index('Date(UTC)')
views_col = headers.index('Page Views')
install_col = headers.index('Install from VSCode')
daily = []
for row in rows[1:]:
    if not row or not row[date_col]:
        continue
    date = datetime.fromisoformat(row[date_col]).date().isoformat()
    installs, views = int(row[install_col]), int(row[views_col])
    if min(installs, views) < 0:
        raise ValueError('Counts must be nonnegative.')
    daily.append({'date': date, 'installs': installs, 'pageViews': views})
daily.sort(key=lambda p: p['date'])
if not daily or len({p['date'] for p in daily}) != len(daily):
    raise ValueError('Expected nonempty daily data with unique dates.')
path = root / 'public/data/marketplace.json'
data = json.loads(path.read_text(encoding='utf-8'))
data['dailyAcquisition'] = daily
running = 0
data['history'] = []
for point in daily:
    running += point['installs']
    data['history'].append({'date': point['date'], 'installs': running})
data['report'] = {'file': report.name, 'timezone': 'UTC', 'start': daily[0]['date'], 'end': daily[-1]['date'], 'installs': running, 'pageViews': sum(p['pageViews'] for p in daily)}
data['analyticsSource'] = 'publisher-export'
path.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
print(f"Imported {len(daily)} days: {running} installs, {data['report']['pageViews']} page views. Original workbook preserved.")
