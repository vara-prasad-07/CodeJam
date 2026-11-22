# CodeJam website

A React + Vite product site with warm white surfaces, blue accents, real screenshots, and a responsive layout. Its spacing and editorial direction reference Symmetry; its content and interface are built for CodeJam. Nothing is automatically published.

## Run locally

```powershell
cd website
npm install
npm run dev
```

Open http://127.0.0.1:5173. Run `npm run build` for production output in `dist/`, then `npm run preview` to serve it at http://127.0.0.1:4173. Run `npm test` for interaction and data checks.

## Your videos are already connected

| Video | File | Display |
| --- | --- | --- |
| Full demo | `public/videos/demo.mp4` | Demo section and Watch the demo buttons |
| Installation | `public/videos/how-to-install.mp4` | Beside the installation steps |

Replace those files to update the footage. Posters are `public/assets/demo-poster.jpg` and `install-poster.jpg`. Media definitions, screenshots, links, FAQs, and six use-case cards live in `src/content.js`. The carousel describes workflows rather than presenting invented customer reviews.

## Marketplace metrics

The original workbook remains at `public/data/CodeJam.codejam-workspace-report.xlsx`. Its four daily rows cover 19-22 November 2026 UTC: 15 page views and 5 installs from VS Code. The chart supports cumulative acquisitions within the period, daily installs, and daily page views. The public Marketplace total is a separate dated snapshot.

After replacing the export with an updated workbook, run `python import_metrics.py`. This validates the dates/counts, preserves the workbook, and updates `public/data/marketplace.json`. Run `npm run metrics` to refresh the public listing total independently. Rebuild after changing data or assets. This is a static snapshot, not a live analytics connection.

## Sources and checks

Screenshots and recordings come from the project. NexConn uses its official wordmark; platform latency and availability figures link to the provider and are distinguished from CodeJam benchmarks. Manrope is served locally under the included SIL Open Font License.

Tests cover metric values, asset paths, keyboard tabs, service selection, media dialogs, focus restoration, clipboard, navigation, and the six-card carousel. Browser rendering was unavailable in the authoring environment, so manual visual review in Chrome remains recommended before submission.
