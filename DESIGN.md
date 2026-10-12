# LeafPad web design contract

Adapt the existing LeafPad desktop interface to a responsive, browser-native editor. The application is a working notebook, with a calm paper canvas and forest-green actions. No framework or remote fonts.

Tokens: canvas #f5f6f1, paper #fffefb, ink #26362d, muted #66746b, accent #286448, selected #e4eee6, line #dce2d9; spacing 4/8/12/16/24/32; radius 8/12; UI font system sans-serif with Korean fallbacks; editor ui-monospace with Korean fallback. Text sizes 12/14/16/22. Focus ring 2px accent. Motion 120ms color changes, disabled for reduced motion.

Desktop: 248px sidebar, flexible editor, 44px horizontally scrolling tab strip, toolbar and status outside the editing scroll area. The textarea alone owns document scrolling. Sidebar file list owns its own scrolling. At <=760px the sidebar becomes a toggleable drawer; toolbar wraps, editor remains full width and tab strip remains horizontally scrollable. Touch targets >=40px. Keyboard-operable tabs, dialogs, import/export, labels, and save controls.

Empty state explains browser storage and offers create/import/connect. Status distinguishes browser persistence, pending file writes, successful MD+OKF writes, and failures. Folder permission is requested only from the connect action. A generated OKF copy is an export, with the plain Markdown as the editable original. Notes never appear in repository assets or telemetry.

QA: real Chromium and Firefox persistence tests; synthetic filesystem test doubles for dual-file writes, failures and conflict copies; desktop/mobile screenshots; keyboard focus, no horizontal overflow, and safe display of HTML-like note content.
