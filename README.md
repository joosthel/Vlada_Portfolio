# Vladyslava Yesypovych — Portfolio

Minimalistische Portfolio-Website als statische Seite für GitHub Pages. Die Seite rendert eine einzige PDF-Datei (`portfolio.pdf`) in einem fortlaufenden Scroll über [PDF.js](https://mozilla.github.io/pdf.js/).

Live: https://yesypovychv.com

## Aufbau

```
index.html        — die einzige Seite
styles.css        — minimales Stylesheet (System-Fonts, viel Weißraum)
main.js           — PDF.js Renderer (lazy via IntersectionObserver)
portfolio.pdf     — das aktuelle Portfolio (wird von der Seite gezeigt)
assets/           — favicon
CNAME             — custom domain: yesypovychv.com
.nojekyll         — GitHub Pages: Jekyll deaktivieren
source/           — sortiertes Rohmaterial (lokal, nicht im Repo — .gitignore)
```

## Portfolio aktualisieren

1. Neue Version der PDF exportieren.
2. Als `portfolio.pdf` im Repo-Root ablegen (überschreiben).
3. Commit + push:
   ```bash
   git add portfolio.pdf
   git commit -m "update portfolio"
   git push
   ```
4. GitHub Pages deployt binnen ~1 Minute, `https://yesypovychv.com` zeigt die neue Version nach einem Hard-Reload (⌘⇧R).

## Lokale Vorschau

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Text ändern

Name, Tagline und Kontakt stehen direkt in `index.html` (Header + Footer). Tagline aktuell:
> Architektin M.A. · ökologisches Bauen · Holzbau · soziale Projekte

## Hosting

- GitHub Pages aus dem `main`-Branch, Root.
- Custom Domain `yesypovychv.com` via `CNAME` + A-Records (siehe Repo-Settings → Pages).
- HTTPS wird automatisch von GitHub via Let's Encrypt bereitgestellt.
