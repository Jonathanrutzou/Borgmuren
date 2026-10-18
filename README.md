# Borgmuren

Topdown borgforsvar på et 32×24-gitter (iPad 4:3), en alternativ udgave af Borgspillet.
Ingen grafik endnu, kun firkanter og cirkler.

Spil den publicerede web-version: https://claude.ai/artifact/QGt4DxtPdg4iafoo9Z7Hfi (eller åbn `index.html` i en browser).
`python3 build_artifact.py <fil>` samler spillet til én fil til web-versionen.

## Sådan spilles
- **Byggefase:** vælg en bygning i værktøjslinjen og tryk på banen. Der bygges ét felt pr. tryk, så man ikke kommer til at bygge en stribe ved en fejl. Der skal altid være en åbning til borgen. De røde prikker viser monstrenes vej.
- **Zoom:** knib med to fingre (eller brug + og − / musehjulet), og træk med én finger for at flytte banen.
- **Tryk på en bygning** for at opgradere eller sælge den. Det, der er bygget i samme byggefase, sælges for fuld pris, og ældre bygninger for 60 %.
- **Helten** styres som i Borgspillet: tryk på banen, så går han derhen ad korteste vej uden om bygningerne. Han slås med monstre, han står ved, og holder dem fast. Monstre inden for 2 felter går efter ham. Han går dobbelt så hurtigt som i Borgspillet (3 felter/sek.). Dør han, kommer han tilbage foran borgen efter 10 sekunder. I byggefasen flyttes han med "Flyt helt".
- **Monstre** (blå = Grunt, rød = Runner) kommer fra venstre og følger labyrinten gennem åbningen. De kan ikke ødelægge mure eller bygninger.
- **Guld** får man for hvert dræbt monster og fra gårde efter hver bølge.

## Bygninger (tal fra Borgspillet)
Hegn, Stenmur, Høj mur, Klæbenet, Port, Jernport, Bueskyttetårn, Langbuetårn, Kanontårn, Stor kanon,
Magertårn, Ærkemagertårn, Kaserne (3 niveauer), Bueskyttelejr, Smedje og Gård. Gården er den eneste
pengebygning. Alle tal står i `CONFIG`, `MONSTERS` og `BUILDINGS` øverst i `game.js`.
