# Fonts

- Converting a variable TTF to WOFF or WOFF2 with FontForge drops the variation tables (`fvar`, `gvar`, `HVAR`, `avar`, `STAT`), leaving a static Regular font, so every `font-weight` renders as 400 even though the file name says "Variable". Found in the Inter 4.001 WOFF and WOFF2 files on 2026-11-01; a FontForge conversion leaves an `FFTM` table in the output. Prefer fontTools (4.67.0, with `brotli` 1.2.1 for WOFF2): `t = TTFont("Inter-Variable.ttf"); t.flavor = "woff2"; t.save("Inter-Variable.woff2")`. Then confirm the output still lists `fvar`.
