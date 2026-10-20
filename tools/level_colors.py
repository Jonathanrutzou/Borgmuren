"""Faste farver for baner tegnet i fx Procreate. Bruges af make_template.py og png_to_level.py
(og står også i editor.html)."""

CELL_PX = 32   # pixels pr. felt i skabelonen

# tegn i banefilen -> (navn, RGB)
COLORS = {
    '.': ('græs', (255, 255, 255)),
    '~': ('vand', (59, 130, 246)),
    '#': ('sten', (128, 128, 128)),
    'S': ('monstrenes indgang', (239, 68, 68)),
    'C': ('borgen', (139, 90, 43)),
}


def nearest(rgb):
    """Tegnet, hvis farve ligger tættest på rgb."""
    return min(COLORS, key=lambda ch: sum((a - b) ** 2 for a, b in zip(COLORS[ch][1], rgb)))
