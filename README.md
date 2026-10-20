# Borgmuren

Topdown borgforsvar på et 32×24-gitter (iPad 4:3), en alternativ udgave af Borgspillet.
Ingen grafik endnu, kun firkanter, streger og cirkler.

Spil den publicerede web-version: https://claude.ai/artifact/QGt4DxtPdg4iafoo9Z7Hfi (eller åbn `index.html` i en browser).
`python3 build_artifact.py <fil>` samler spillet til én fil til web-versionen.

## Sådan spilles
- **Menuer:** Spillet starter med START. Et tryk ruller ned til baneoversigten. Øverst er banerne med 0-3 stjerner (træk sidelæns for at se flere), og nederst er opgraderinger, der skal købes for stjerner (endnu kun pladsholdere). Tryk på en bane, så ruller den ned til spillet. Knappen "Baner" går tilbage til oversigten. Er banen i gang, kan man vælge mellem at fortsætte og at starte forfra.
- **Bue:** Buen købes for 2 stjerner i baneoversigten. Derefter skifter knappen Sværd/Bue i spillet heltens våben. Med buen skyder helten 4 felter (også flagermus), men holder ingen monstre fast.
- **Stjerner:** 3 stjerner, hvis borgen har mindst 18 liv tilbage, 2 stjerner ved mindst 10 liv, ellers 1.
- **Landskab:** spillet vises altid i landskab, også når skærmen holdes på højkant.
- **Bane 1** består af 10 runder. Hver runde har en byggefase og en bølge.
- **Byg:** tryk på "Byg" for at folde byggemenuen frem, og igen for at folde den væk. Ét tryk bygger én ting.
  - **Hegn, stenmur og porte** ligger på stregen mellem to felter, så der stadig kan bygges i felterne ved siden af. Tryk tæt på den streg, du vil bygge på. En stenmur er dobbelt så tyk som et hegn.
  - **Tårne, kaserner, smedje, gård og klæbenet** fylder et felt.
  - Der skal altid være en åbning til borgen. De røde prikker viser monstrenes vej.
- **Tryk på en bygning** (med byggemenuen lukket) for at opgradere, reparere eller sælge den. Det, der er bygget i samme byggefase, sælges for fuld pris, og ældre bygninger for 60 %.
- **Soldater og bueskytter:** tryk på deres kaserne og så "Flyt soldater", og tryk derefter, hvor de skal stå, fx langt inde bag muren. Under en bølge trykker man bare på kasernen og derefter på stedet.
- **Helten** går derhen, hvor man trykker (når byggemenuen er lukket), ad korteste vej, også på skrå. Han slås med monstre, han står ved, og holder dem fast. Monstre inden for 2 felter går efter ham. Dør han, kommer han tilbage foran borgen efter 10 sekunder.
- **Monstre** (blå = Grunt, rød = Runner) kommer fra venstre og går den korteste vej mod borgen, også på skrå. De kan ikke komme gennem mure og hegn, men de kan smadre bygninger, der står i vejen. Porte holder dem tilbage et øjeblik.
- **Efter hver runde** får helt, soldater og bueskytter fuldt liv igen, og gårdene giver guld.
- **Zoom:** knib med to fingre (eller musehjul), og træk med én finger for at flytte banen. Banen kan rulles lidt forbi kanten, så kanterne kan ses under knapperne.
- **Bygninger** må ikke hegnes helt inde: monstrene skal altid kunne komme hen til dem (porte er i orden).
- **Tempo x2** gør spillet dobbelt så hurtigt.

## Bygninger (tal fra Borgspillet)
Hegn, Stenmur, Høj mur, Port, Jernport, Klæbenet, Bueskyttetårn, Langbuetårn, Kanontårn, Stor kanon,
Magertårn, Ærkemagertårn, Kaserne (3 niveauer), Bueskyttelejr, Smedje og Gård. Gården er den eneste
pengebygning. Alle tal står i `CONFIG`, `MONSTERS` og `BUILDINGS` øverst i `game.js`.
