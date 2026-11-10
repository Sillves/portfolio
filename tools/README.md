# tools

## beerse-crypt.mjs

`beerse.html` bevat de volledige voorstelpagina (HTML, CSS, JS, cijfers) als versleutelde blob.
Zonder dit script en het wachtwoord is de inhoud niet te bewerken; de onversleutelde bron staat nergens in de repo.

```sh
BEERSE_PW='…' node tools/beerse-crypt.mjs decrypt   # → .beerse-src/
# bewerk .beerse-src/payload.html, payload.css, payload.js, payload.data.json
BEERSE_PW='…' node tools/beerse-crypt.mjs encrypt   # → beerse.html (met controle)
```

- `.beerse-src/` staat in `.gitignore`. Commit nooit onversleutelde inhoud: de repo is publiek.
- `payload.js` draait in de pagina als `new Function('dash', 'd3', js)`; `dash` levert de parameters, tekenfuncties en `dash.vault` (sleutel en token voor de gedeelde versies).
- Versleutelen gebruikt telkens een nieuwe salt en iv; de diff in `beerse.html` is dus altijd één regel.
- Wachtwoord wijzigen: dan worden opgeslagen versies onleesbaar en moet `VOORSTEL_TOKEN_HASH` op de server mee veranderen (zie `voorstel-api/` en l-craft-infra).
