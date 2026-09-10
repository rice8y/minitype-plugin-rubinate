# Build the documentation

From the repository root:

```sh
npm ci
npm run documentation
npm run documentation:images
```

The image command requires Poppler (`pdftoppm`) and ImageMagick (`magick`). It executes the TypeScript listings in README.md and generates compact typeset previews under `docs/assets/`. Listings with identical output share one image; the build checks that their rendered images match. Each standalone image is trimmed to its typeset content with a 12-pixel white border. The images contain no page furniture or figure frame.

The documentation command generates [documentation.pdf](documentation.pdf), with Quick Start, Usage, Public API and License sections. It runs entirely offline after dependency installation.

- [src/index.ts](src/index.ts) executes all examples and composes the manual.
- [src/examples](src/examples) contains the TypeScript shown in the manual.
- [src/example-source.ts](src/example-source.ts) extracts those function bodies from source; listings are not maintained as separate copies.
- [src/reference.ts](src/reference.ts) contains the API and runtime reference.
- [src/layout.ts](src/layout.ts) defines the cover, contents, listings and running furniture.
- `.generated/execution-report.json` records the examples and page numbers.

`npm run check` checks the plugin, examples and documentation against the public types. Only H1 sections start a new page. H2 subsections flow naturally; contents page numbers resolve from heading labels and the execution report records actual layout positions. Render the PDF and inspect every page after layout changes.


Use only the example sentences already present in README.md. Typeset results use dedicated ruby leading and vertical padding in `exampleFigure()`; do not reuse prose leading or crop results from manual pages.

The TSX example uses `@minitype/tsx` and is compiled and executed with the other manual examples. Run the complete standalone TSX document with `npm run example:tsx`.
