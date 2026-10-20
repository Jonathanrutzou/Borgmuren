"""Laver en tom skabelon (PNG med gitter) til at tegne en bane i fx Procreate.

Brug: python3 tools/make_template.py <bredde i felter> <højde i felter> <udfil.png>
Hvert felt er 32×32 px. Mal felterne med farverne i forklaringen nederst
(hvid græs, blå vand, grå sten, rød indgang, brun borg). Forklaringen klippes fra, når billedet læses.
"""
import sys

from PIL import Image, ImageDraw

from level_colors import CELL_PX, COLORS

cols, rows, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
if not (8 <= cols <= 80 and 6 <= rows <= 60):
    sys.exit('Banen skal være mellem 8×6 og 80×60 felter.')
legend_h = 28   # under ét felt, så png_to_level.py ikke tæller forklaringen som en række
img = Image.new('RGB', (cols * CELL_PX, rows * CELL_PX + legend_h), 'white')
d = ImageDraw.Draw(img)
for x in range(cols + 1):
    d.line([(x * CELL_PX, 0), (x * CELL_PX, rows * CELL_PX)], fill=(210, 210, 210))
for y in range(rows + 1):
    d.line([(0, y * CELL_PX), (cols * CELL_PX, y * CELL_PX)], fill=(210, 210, 210))
x = 8
for ch, (name, rgb) in COLORS.items():
    d.rectangle([x, rows * CELL_PX + 6, x + 16, rows * CELL_PX + 22], fill=rgb, outline=(0, 0, 0))
    d.text((x + 22, rows * CELL_PX + 9), name, fill=(0, 0, 0))
    x += 22 + int(d.textlength(name)) + 18
img.save(out)
print(f'Skabelon {cols}×{rows} gemt i {out}')
