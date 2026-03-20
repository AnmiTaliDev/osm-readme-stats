# osm-readme-stats

Generate SVG badges and activity heatmaps from your [OpenStreetMap](https://openstreetmap.org) editing history — designed to drop into a GitHub Profile README.

**License:** [AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html)\
**Base URL:** `https://osmapi.anmitali.dev`\
**Sandbox:** `https://osmapi.anmitali.dev/sandbox`

---

## Quick start

```markdown
<!-- Badge by username -->
![OSM Edits](https://osmapi.anmitali.dev/badge?username=YourUsername)

<!-- Badge by user ID -->
![OSM Edits](https://osmapi.anmitali.dev/badge?user_id=123456)

<!-- Activity heatmap -->
![OSM Heatmap](https://osmapi.anmitali.dev/heatmap?username=YourUsername)
```

---

## Endpoints

### `GET /badge`

Returns an `image/svg+xml` shields.io-compatible badge with the total changeset count.

| Parameter     | Required   | Default        | Description                                          |
|---------------|------------|----------------|------------------------------------------------------|
| `username`    | one of two | —              | OSM display name                                     |
| `user_id`     | one of two | —              | Numeric OSM user ID (takes priority over `username`) |
| `style`       | no         | `flat`         | `flat` · `plastic` · `for-the-badge`                 |
| `label`       | no         | locale default | Left-section text                                    |
| `label_color` | no         | `grey`         | HEX or named color for the label section             |
| `color`       | no         | `brightgreen`  | HEX or named color for the value section             |
| `compact`     | no         | `false`        | `true` → abbreviate numbers (`12.4k`, `1.5M`)        |
| `locale`      | no         | `en`           | `en` · `ru` · `kk` · `de` · `fr`                    |

#### Named colors

`brightgreen` · `green` · `yellow` · `orange` · `red` · `blue` · `lightgrey` · `grey`

Any 3- or 6-digit hex value is also accepted (without `#`).

#### Examples

```markdown
![OSM Edits](https://osmapi.anmitali.dev/badge?username=SomeMapper)
![OSM Edits](https://osmapi.anmitali.dev/badge?username=SomeMapper&style=plastic&compact=true)
![OSM Правки](https://osmapi.anmitali.dev/badge?username=SomeMapper&style=for-the-badge&locale=ru)
![OSM Edits](https://osmapi.anmitali.dev/badge?username=SomeMapper&label_color=007ec6&color=fe7d37)
```

---

### `GET /heatmap`

Returns an `image/svg+xml` activity heatmap for the past year (53 weeks × 7 days), styled after GitHub's contribution graph. Changeset data is fetched in parallel monthly windows so even very active mappers are covered correctly.

| Parameter     | Required   | Default   | Description                                          |
|---------------|------------|-----------|------------------------------------------------------|
| `username`    | one of two | —         | OSM display name                                     |
| `user_id`     | one of two | —         | Numeric OSM user ID (takes priority over `username`) |
| `palette`     | no         | `green`   | `green` · `blue` · `orange` · `purple` · `red`       |
| `theme`       | no         | `light`   | `light` · `dark`                                     |
| `hide_title`  | no         | `false`   | `true` → hide the stats title line                   |
| `hide_legend` | no         | `false`   | `true` → hide the Less/More legend                   |

#### Examples

```markdown
![OSM Heatmap](https://osmapi.anmitali.dev/heatmap?username=SomeMapper)
![OSM Heatmap](https://osmapi.anmitali.dev/heatmap?username=SomeMapper&palette=blue&theme=dark)
![OSM Heatmap](https://osmapi.anmitali.dev/heatmap?username=SomeMapper&hide_legend=true)
```

---

### `GET /status`

Health-check. Always returns HTTP 200; inspect the JSON body for service state.

```json
{
  "status": "ok",
  "services": {
    "osm_api": "ok",
    "osm_changesets": "ok"
  },
  "checked_at": "2025-06-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

`osm_api` and `osm_changesets` can each be `"ok"`, `"degraded"`, or `"down"`.

---

### `GET /sandbox`

Interactive builder — live preview of both heatmap and badge, copy-ready Markdown snippets.

---

## Error handling

All errors return an SVG badge (never JSON), so they render gracefully inside GitHub READMEs.

| Situation           | Badge text       | HTTP |
|---------------------|------------------|------|
| Missing params      | `invalid params` | 400  |
| User not found      | `user not found` | 404  |
| OSM API unreachable | `osm api error`  | 502  |

Responses are cached at the Cloudflare edge for 1 hour (`Cache-Control: public, max-age=3600`). Error responses are never cached.

---

## Self-hosting

Requires [Wrangler](https://developers.cloudflare.com/workers/wrangler/) and a Cloudflare account.

```bash
npm install
npm run dev       # local dev server on http://localhost:8787
npm run deploy    # deploy to Cloudflare Workers
```

Update the `routes` entry in `wrangler.toml` to match your own domain before deploying.

---

## Tech stack

| Layer    | Technology                               |
|----------|------------------------------------------|
| Runtime  | Cloudflare Workers                       |
| Language | TypeScript (strict, no `any`)            |
| Router   | [Hono.js](https://hono.dev)              |
| Data     | [OSM API v0.6](https://wiki.osm.org/API) |
| Sandbox  | Vanilla HTML + JS (no bundler)           |

---

## License

AGPL-3.0-only — see [https://www.gnu.org/licenses/agpl-3.0.html](https://www.gnu.org/licenses/agpl-3.0.html).
