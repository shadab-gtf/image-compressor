# Smart Draw

`/smart-draw` is ShrinkFox's local drawing workspace. The page reads catalog data and 48 original vector symbols from `lib/api`, passes them through the tool section, and loads the interactive editor with a matching skeleton. The existing global and dynamic-route loading/error boundaries and metadata apply. The route is in the catalog, menus, footer, sitemap and offline page list.

## Included

- Smart sketch: multiple strokes are matched against the symbol library. Select a suggestion to replace those strokes, or keep the sketch and start the next object. Search adds a clean symbol directly.
- Freehand drawing, rectangle/ellipse/triangle/line tools, text with size and bold controls, outline colors and widths, object/background fill, and object erasing.
- Selection and dragging; size, rotation, duplication, deletion and layer order; keyboard nudging and shortcuts.
- Undo/redo, new canvas with undo, landscape/square/portrait/HD sizes, transparent background, zoom, touch pinch and pan, fullscreen where available.
- Local autosave, validated project import/export, PNG and SVG downloads, and native file sharing with download fallback.

## Recognition and storage

Recognition uses normalized point-cloud distance over original local templates. It is geometric matching, not Google's machine-learning model or recognition service. The 48 available symbols are intentionally visible and searchable; suggestions do not cover arbitrary objects. Strokes and artwork are never sent to a prediction server. There is no remote hosting of shared projects.

Fill operates on vector objects, including closed freehand paths. Erasing removes a complete object. Canvas exports support up to 4096 pixels per edge and 12 MP for imported projects. Projects are limited to 500 objects, 50,000 points and 3 MB. Undo retains 30 edits. Autosave depends on browser storage; downloading a project is the durable backup.

## Validation

Run `npm run test:drawing` for rough-sketch recognition, history, project validation and safe SVG output. Run `npm run test:drawing-browser` against `BASE_URL` (default `http://localhost:3000`) for desktop editing, transparent exports, project round-trip/reload and mobile touch drawing. Screenshots and downloaded test artifacts are written to the ignored `temp/drawing-check` directory. `npm run build` verifies production rendering.
