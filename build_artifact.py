"""Samler index.html og game.js til én fil til den spilbare web-version (Claude-artifact).

Brug: python3 build_artifact.py <udfil>
"""
import re
import sys

html = open('index.html', encoding='utf-8').read()
game = open('game.js', encoding='utf-8').read()
style = re.search(r'<style>.*?</style>', html, re.S).group(0)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
body = body.replace('<script src="game.js"></script>', '<script>\n' + game + '\n</script>')
page = '<title>Borgmuren</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + style + '\n' + body
open(sys.argv[1], 'w', encoding='utf-8').write(page)
