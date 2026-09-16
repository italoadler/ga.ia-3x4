# iNaturalist image attribution

These four local files are captured observation media, not decorative textures. Each remains under the license attached to the individual photo on iNaturalist. The application shows the author, license, observation ID and original observation URL with the portrait.

| Local file | Observed organism | Observer / image author | Locality and observation date | Source | License |
| --- | --- | --- | --- | --- | --- |
| `399498913-732969051.jpg` | *Aegopsis bolboceridus* | Mario Barroso (`mariobarroso`) | Cidade Ocidental, GO, BR — 2026-09-12 | [observation 399498913](https://www.inaturalist.org/observations/399498913) / [captured large photo](https://inaturalist-open-data.s3.amazonaws.com/photos/732969051/large.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `397768311-729588883.jpg` | *Pterandra pyroidea* | Mario Barroso (`mariobarroso`) | Cidade Ocidental, GO, BR — 2026-09-06 | [observation 397768311](https://www.inaturalist.org/observations/397768311) / [captured large photo](https://inaturalist-open-data.s3.amazonaws.com/photos/729588883/large.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `393600054-721458676.jpg` | *Cybistax antisyphilitica* | André Ambrozio (`andre_ambrozio`) | Brasília, DF, BR — 2026-08-22 | [observation 393600054](https://www.inaturalist.org/observations/393600054) / [captured large photo](https://inaturalist-open-data.s3.amazonaws.com/photos/721458676/large.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `388807360-712138947.jpg` | *Callicore sorana* | Libris Simas Ferraz (`libris`) | Pirenópolis, GO, Brazil — 2026-08-06 | [observation 388807360](https://www.inaturalist.org/observations/388807360) / [captured large photo](https://inaturalist-open-data.s3.amazonaws.com/photos/712138947/large.jpg) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The exact API response is `observations.raw.json`. `capture.json` records its retrieval timestamp and SHA-256, plus the byte length, SHA-256, source URL, status, credit and license of every image. Run `npm run capture:living` only when intentionally replacing the capture; the command revalidates research grade, category, photo ID, license and attribution before writing any file.
