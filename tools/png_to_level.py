"""Laver en bane til levels.js ud fra en tegning med de faste farver (se make_template.py).

Brug: python3 tools/png_to_level.py <tegning.png> [bredde højde] [navn]
Uden bredde og højde regnes de ud fra billedet (32 px pr. felt; en forklaring nederst klippes fra).
Er billedet skaleret (fx et skærmbillede fra iPad), så angiv bredde og højde i felter.
Midten af hvert felt læses, og den nærmeste faste farve vælges, så streger og små
farveafvigelser ikke gør noget. Udskriver banen, klar til at sætte ind i levels.js.
"""
import json
import sys
from collections import Counter

from PIL import Image

from level_colors import CELL_PX, nearest

img = Image.open(sys.argv[1]).convert('RGB')
args = sys.argv[2:]
if len(args) >= 2 and args[0].isdigit() and args[1].isdigit():
    cols, rows, args = int(args[0]), int(args[1]), args[2:]
    cell = img.width / cols
else:
    if img.width % CELL_PX:
        print('// Advarsel: billedet er ikke 32 px pr. felt. Angiv bredde og højde i felter.', file=sys.stderr)
    cell = img.width / round(img.width / CELL_PX)
    cols = round(img.width / cell)
    rows = int(img.height // cell)   # en forklaring under gitteret giver under et helt felt ekstra og tælles ikke
name = args[0] if args else 'Ny bane'

rows_out = []
for y in range(rows):
    line = ''
    for x in range(cols):
        # flertallet af pixels i midten af feltet (40 %), så gitterstreger ikke tæller
        x0, y0 = int((x + 0.3) * cell), int((y + 0.3) * cell)
        x1, y1 = max(x0 + 1, int((x + 0.7) * cell)), max(y0 + 1, int((y + 0.7) * cell))
        votes = Counter(nearest(img.getpixel((px, py))) for px in range(x0, x1, 2) for py in range(y0, y1, 2))
        line += votes.most_common(1)[0][0]
    rows_out.append(line)

print('  { name: %s, waves: { same: 2, growth: 0.06, hpGrowth: 0.02 },' % json.dumps(name, ensure_ascii=False))
print('    map: [')
for r in rows_out:
    print('      %s,' % json.dumps(r))
print('    ] },')
