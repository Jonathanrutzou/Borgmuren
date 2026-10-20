"""Samler index.html, levels.js og game.js til én fil til den spilbare web-version (Claude-artifact).

Brug: python3 build_artifact.py <udfil> [--editor]
Med --editor kommer baneeditoren (editor.js) med; den er ikke en del af spillet.
"""
import re
import sys

html = open('index.html', encoding='utf-8').read()
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
links = '\n'.join(re.findall(r'<link [^>]*>', html))
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
editor = '--editor' in sys.argv[2:]
if editor:
    body = body.replace('<script src="game.js"></script>', '<script src="game.js"></script>\n  <script src="editor.js"></script>')
# hvert <script src="..."> erstattes af filens indhold
body = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: '<script>\n' + open(m.group(1), encoding='utf-8').read() + '\n</script>', body)
title = 'Borgmuren baneeditor' if editor else 'Borgmuren'
page = f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + links + '\n' + style + '\n' + body
open(sys.argv[1], 'w', encoding='utf-8').write(page)
