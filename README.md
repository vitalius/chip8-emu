# Chip8 emulator in JavaScript

Building a simple Chip-8 emulator in JavaScript. The emulation core has no
DOM dependencies, and is covered by unit tests.

See it in action [https://home.cloudmotion.com/chip8/](https://home.cloudmotion.com/chip8/)

## Files

| File | Role |
| --- | --- |
| `chip8-core.js` | Emulation core: CPU state and opcode interpreter. No DOM. |
| `rom.js` | ROM loader: reads `.ch8` files from `roms/` (fetch in the browser, fs in Node). |
| `roms/` | Sample ROMs (`.ch8` binary files). |
| `keymap.js` | Maps physical `KeyboardEvent.code`s (number row, numpad, `A`–`F`) to the 16 Chip-8 key names. |
| `chip8.js` | Browser frontend: canvas rendering, keyboard input, 60 Hz step loop (2×/10×/100×/1000×), `?rom=`/`?speed=` URL parameters. |
| `chip8-core.test.js` | Unit tests for the core (Node built-in test runner). |
| `index.html`, `chip8.css` | Browser UI (64×32 canvas + instruction log). |
| `package.json` | `npm test` script. No dependencies. |

## Architecture

### `chip8-core.js` — the CPU

Everything the emulator *is* lives here, in a `Chip8` class:

- **State:** 4 KiB `memory`, 16 `V` registers (V0–VF), index register `I`,
  program counter `pc`, 16-slot `stack` with `sp`, `delayTimer` /
  `soundTimer`, a 64×32 `screen` framebuffer, and key state (`keys`,
  `waitingForKey`, `keyTarget`).
- **`reset(rom)` / `loadRom(bytes)`** — zero all state, load the 80-byte
  font sprites (16 glyphs × 5 rows) at `0x50`–`0x9F` and rom bytes at `0x200`.
- **`step()`** — fetch/decode/execute one 16-bit opcode at `pc` and advance
  `pc`. Returns the executed instruction as a log line
  (e.g. `"200:6001 Sets V0 to 1"`); frontends decide where to print it.
- **`run(opcode)`** — the opcode interpreter (00E0 through FX65).
- **`drawSprite(xReg, yReg, rows)`** — DXYN: XOR-draws `rows` bytes from `I`
  at `(VX, VY)`, sets VF on pixel collision, wraps at the screen edges.
- **`tickTimers()`** — decrement the delay/sound timers once per step.
- **`keyDown(key)` / `keyUp(key)`** — keys are hex names (`"0"`–`"9"`,
  `"A"`–`"F"`); `keyDown` also resolves a pending key-wait (FX0A) by storing
  the key in the target V register.

The file contains no `document` / `window` / `requestAnimationFrame`
references. A small UMD guard at the bottom exports it both ways:
`module.exports` in Node, a global `Chip8` in the browser — no build step.

### `rom.js` — ROM loading

`rom.js` loads ROM files from the `roms/` directory (`.ch8` binaries,
big-endian bytes) as byte arrays, which is what `loadRom` consumes. It keeps
the list of available ROMs (`ROMS`) and the default one (`DEFAULT_ROM`);
browsers cannot list directories, so the list is hardcoded there. In the
browser `loadRomFile(name)` fetches `roms/<name>` relative to the page URL
and resolves to a byte array; in Node it reads the file synchronously with
`fs`. The default ROM (`maze1.ch8`) fills the screen with a diagonal tile
pattern row by row, then idles in a self-loop at `0x21c`.

### `chip8.js` — browser frontend

Thin glue around the CPU: creates the machine, loads the ROM selected in the
`#rom-select` dropdown (fetched from `roms/`; a sequence number discards a
stale load if a newer ROM is picked mid-flight), renders the framebuffer to
the 64×32 canvas on every animation frame, maps browser key codes to Chip-8
keys, and drives the core at a selectable 2×/10×/100×/1000× multiple of the
base 60 steps/s rate (`#speed-select`). Both dropdowns read their initial
values from the `?rom=` / `?speed=` URL parameters (validated against the
available options; unknown values log a warning and fall back to the
defaults) and rewrite their parameter on change, so the current selection can
be shared as a link. Run/Pause/Step/Reset buttons and `R` control execution;
changing the ROM dropdown loads and resets the machine with the new ROM. The
instruction log is appended to the `#log` paragraph (last 50 lines, at most
10 lines per frame — so at 100× it shows a sample of the executed
instructions).

## Running

### Browser

Serve the directory (e.g. `npx http-server`) and open the page in a browser —
ROMs are loaded with `fetch`, so opening `index.html` via `file://` won't
work.

The `#rom-select` dropdown picks which ROM from `roms/` to run; choosing one
loads and resets the machine. Run/Pause/Step/Reset buttons and `R` control
execution; `Step` executes a single instruction while paused.

The initial ROM and speed can be set via the `?rom=` and `?speed=` URL
parameters (e.g. `index.html?rom=brick.ch8&speed=100`); unknown or missing
values fall back to the defaults. Changing either dropdown updates the
corresponding parameter, so the current selection can be shared as a link.

Keys: number row `1`–`0`, numpad `1`–`0`, and letters `A`–`F` (mapping in
`keyMap` in `keymap.js`).

### Tests

```sh
npm test        # runs node --test over *.test.js
node --test     # equivalent, no npm needed
```

Unit tests cover every opcode group (including VF carry/borrow/shift
flags), PC math for all skip/jump/call opcodes, sprite drawing and XOR
collision, key handling (including the `keymap.js` physical-code mapping),
timers, `step()` mechanics, loading the ROM files from `roms/`, and two
seeded end-to-end runs: `maze1.ch8` (`Math.random` stubbed for determinism,
pinned to the exact final PC, register values, and 512-pixel screen) and
`brick.ch8` (paddle moves left/right in response to keys 4/6).

## Requirements

- Node.js ≥ 18 (tests use the built-in `node:test` module).
- No npm dependencies.
