# Borgmuren

Topdown borgforsvar på et 32×24-gitter (iPad 4:3). Ingen grafik endnu – kun firkanter og cirkler.

Åbn `index.html` i en browser for at spille.

## Sådan spilles
- **Byggefase:** træk på banen for at tegne mur. Tryk på en hel mur for at fjerne den (du får murstenen igen), tryk på en skadet mur for at reparere den (koster 1 mursten). Muren skal have mindst én åbning.
- **Placér helt:** vælg knappen og tryk, hvor helten skal stå vagt. Helten angriber monstre inden for den grønne cirkel.
- **Start bølge:** monstre (blå og røde) kommer fra venstre og går mod borgen. Er åbningen langt væk, slår de hul i muren i stedet.
- Under bølgen kan du trykke på banen for at flytte heltens vagtpunkt.
- Hvert monster, der når borgen, giver skade. Når borgen er på 0, er spillet slut.

## Balance
Alle tal (liv, skade, fart, antal monstre pr. bølge, mursten) står i `CONFIG` og `waveMonsters()` øverst i `game.js`.
