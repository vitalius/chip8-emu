var test = require('node:test');
var assert = require('node:assert/strict');

var Chip8 = require('./chip8-core.js');
var roms = require('./rom.js');
var keyMap = require('./keymap.js');

function makeCpu() {
    return new Chip8();
}

function setWord(cpu, addr, word) {
    cpu.memory[addr] = (word >> 8) & 0xff;
    cpu.memory[addr + 1] = word & 0xff;
}

function loadWords(cpu, words) {
    for (var i = 0; i < words.length; i++)
        setWord(cpu, 0x200 + i * 2, words[i]);
}

function screenPixels(cpu) {
    var n = 0;
    for (var i = 0; i < cpu.screen.length; i++)
        n += cpu.screen[i];
    return n;
}

function withRandom(value, fn) {
    var original = Math.random;
    Math.random = function () { return value; };
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}

test("reset() / loadRom()", (t) => {
    t.test("initialises CPU state", () => {
        var cpu = makeCpu();
        assert.equal(cpu.pc, 0x200);
        assert.equal(cpu.I, 0);
        assert.equal(cpu.sp, 0);
        assert.equal(cpu.delayTimer, 0);
        assert.equal(cpu.soundTimer, 0);
        assert.equal(cpu.waitingForKey, false);
        assert.equal(screenPixels(cpu), 0);
        cpu.V.forEach(function (v) { assert.equal(v, 0); });
        assert.equal(cpu.stack.length, 16);
    });

    t.test("loads font sprites at 0x50", () => {
        var cpu = makeCpu();
        assert.deepEqual(
            cpu.memory.slice(0x50, 0xa0),
            new Uint8Array([
                0xf0, 0x90, 0x90, 0x90, 0xf0, // 0
                0x20, 0x60, 0x20, 0x20, 0x70, // 1
                0xf0, 0x10, 0xf0, 0x80, 0xf0, // 2
                0xf0, 0x10, 0xf0, 0x10, 0xf0, // 3
                0x90, 0x90, 0xf0, 0x10, 0x10, // 4
                0xf0, 0x80, 0xf0, 0x10, 0xf0, // 5
                0xf0, 0x80, 0xf0, 0x90, 0xf0, // 6
                0xf0, 0x10, 0x20, 0x40, 0x40, // 7
                0xf0, 0x90, 0xf0, 0x90, 0xf0, // 8
                0xf0, 0x90, 0xf0, 0x10, 0xf0, // 9
                0xf0, 0x90, 0xf0, 0x90, 0x90, // A
                0x80, 0xf0, 0x80, 0xf0, 0x80, // B
                0xe0, 0x90, 0x80, 0x90, 0xe0, // C
                0x80, 0xc0, 0xa0, 0x90, 0x80, // D
                0xf0, 0x80, 0x80, 0x80, 0xf0, // E
                0xf0, 0x80, 0x80, 0x80, 0x80  // F
            ])
        );
    });

    t.test("loadRom() writes bytes at 0x200", () => {
        var cpu = makeCpu();
        cpu.loadRom([0xab, 0xcd, 0xef]);
        assert.equal(cpu.memory[0x200], 0xab);
        assert.equal(cpu.memory[0x201], 0xcd);
        assert.equal(cpu.memory[0x202], 0xef);
    });

    t.test("reset(rom) reloads a rom", () => {
        var cpu = makeCpu();
        cpu.loadRom([0x11]);
        cpu.reset([0x22]);
        assert.equal(cpu.memory[0x200], 0x22);
        assert.equal(cpu.pc, 0x200);
    });
});

test("rom.js loads ROM files from the roms directory", () => {
    assert.deepEqual(roms.ROMS, ['maze1.ch8', 'maze2.ch8', 'particle.ch8', 'sierpinski.ch8', 'space-inv.ch8', 'cave.ch8', 'brick.ch8', 'airplane.ch8']);
    assert.equal(roms.DEFAULT_ROM, 'maze1.ch8');
    var maze1 = roms.loadRomFile('maze1.ch8');
    assert.equal(maze1.length, 38);
    assert.deepEqual(maze1.slice(0, 6), new Uint8Array([0x60, 0x00, 0x61, 0x00, 0xa2, 0x22]));
    roms.ROMS.forEach(function (name) {
        var bytes = roms.loadRomFile(name);
        assert.ok(bytes.length > 0, name + " is empty");
        assert.ok(bytes.length <= 4096 - 0x200, name + " does not fit in memory");
    });
});

test("00E0 / 2NNN / 00EE", (t) => {
    t.test("00E0 clears the screen", () => {
        var cpu = makeCpu();
        cpu.screen[0] = 1;
        cpu.screen[123] = 1;
        cpu.run(0x00e0);
        assert.equal(screenPixels(cpu), 0);
    });

    t.test("2NNN / 00EE call and return round-trip", () => {
        var cpu = makeCpu();
        setWord(cpu, 0x200, 0x2300);
        setWord(cpu, 0x300, 0x00ee);
        cpu.step();
        assert.equal(cpu.sp, 1);
        assert.equal(cpu.stack[0], 0x202);
        assert.equal(cpu.pc, 0x300);
        cpu.step();
        assert.equal(cpu.sp, 0);
        assert.equal(cpu.pc, 0x202);
    });

    t.test("stack wraps around at 16 entries", () => {
        var cpu = makeCpu();
        cpu.sp = 15;
        cpu.run(0x2300);
        assert.equal(cpu.sp, 0);
        assert.equal(cpu.stack[15], 0x202); // written before sp wraps
    });

    t.test("00EE with an empty stack is reported and falls through (no stale pop)", () => {
        var cpu = makeCpu();
        loadWords(cpu, [0x00ee, 0x6001]);
        var line = cpu.step();
        assert.ok(line.indexOf("!!! 00EE with an empty stack") !== -1);
        assert.equal(cpu.sp, 0);
        assert.equal(cpu.pc, 0x202); // pc not held: falls through to the next opcode
        cpu.step();
        assert.equal(cpu.V[0], 1); // the marker opcode after the 00EE still runs
    });
});

test("1NNN / 2NNN / BNNN", (t) => {
    t.test("1NNN jumps and holds pc", () => {
        var cpu = makeCpu();
        loadWords(cpu, [0x1234]);
        var line = cpu.step();
        assert.equal(cpu.pc, 0x234);
        assert.ok(line.indexOf("Jumps to address 234") !== -1);
    });

    // The push of pc+2 is covered by the "2NNN / 00EE call and return
    // round-trip" test; here we pin that 2NNN holds pc so step() does not
    // advance it.
    t.test("2NNN jumps and holds pc", () => {
        var cpu = makeCpu();
        cpu.pc = 0x210;
        cpu.run(0x2200);
        assert.equal(cpu.pc, 0x200);
        assert.equal(cpu.pcHeld, true);
    });

    t.test("BNNN jumps to NNN + V0", () => {
        var cpu = makeCpu();
        cpu.V[0] = 5;
        cpu.run(0xb200);
        assert.equal(cpu.pc, 0x205);
    });

    t.test("BNNN result wraps through step() pc masking", () => {
        var cpu = makeCpu();
        cpu.V[0] = 0xff;
        loadWords(cpu, [0xbfff]);
        cpu.step();
        assert.equal(cpu.pc, 0x10fe); // NNN + V0 = 0xfff + 0xff
        cpu.step(); // masks pc to 0x0fe, runs a zeroed word, advances 2
        assert.equal(cpu.pc, 0x100);
    });
});

test("skip opcodes advance pc correctly through step()", (t) => {
    // Program: [skip opcode at 0x200, 0x60AA marker at 0x202]. The skip
    // opcode is stepped once (pcAfterSkip), then the marker is stepped too,
    // so a fall-through actually executes it. A taken skip jumps over the
    // marker (V0 stays as set), a fall-through runs it (V0 becomes 0xaa).
    function runSkip(skipOpcode, v0, v1) {
        var cpu = makeCpu();
        cpu.V[0] = v0;
        cpu.V[1] = v1;
        loadWords(cpu, [skipOpcode, 0x60aa]);
        cpu.step();
        var pcAfterSkip = cpu.pc;
        if (pcAfterSkip === 0x202)
            cpu.step(); // execute the marker
        return { cpu: cpu, pcAfterSkip: pcAfterSkip };
    }

    t.test("3XNN skips when VX equals NN", () => {
        var r = runSkip(0x3005, 5, 0);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 5);
    });

    t.test("3XNN falls through when VX differs", () => {
        var r = runSkip(0x3005, 4, 0);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("4XNN skips when VX differs", () => {
        var r = runSkip(0x4005, 4, 0);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 4);
    });

    t.test("4XNN falls through when VX equals", () => {
        var r = runSkip(0x4005, 5, 0);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("5XY0 skips when VX equals VY", () => {
        var r = runSkip(0x5010, 3, 3);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 3);
    });

    t.test("5XY0 falls through when VX differs from VY", () => {
        var r = runSkip(0x5010, 2, 3);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("5XYn only skips for n == 0", () => {
        var r = runSkip(0x5013, 3, 3);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("9XY0 skips when VX differs from VY", () => {
        var r = runSkip(0x9010, 2, 3);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 2);
    });

    t.test("9XY0 falls through when VX equals VY", () => {
        var r = runSkip(0x9010, 3, 3);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("9XYn currently skips for n != 0 as well (pins pre-existing divergence from spec)", () => {
        var r = runSkip(0x9013, 2, 3);
        assert.equal(r.pcAfterSkip, 0x204);
    });
});

test("6XNN / 7XNN", (t) => {
    t.test("6XNN sets VX", () => {
        var cpu = makeCpu();
        cpu.run(0x65ff);
        assert.equal(cpu.V[5], 0xff);
    });

    t.test("7XNN adds NN and wraps at 0xff", () => {
        var cpu = makeCpu();
        cpu.V[0] = 0xff;
        cpu.run(0x7001);
        assert.equal(cpu.V[0], 0x00);
        cpu.V[0] = 0x10;
        cpu.run(0x7020);
        assert.equal(cpu.V[0], 0x30);
    });
});

test("8XYn arithmetic and bitwise ops", (t) => {
    t.test("8XY0 assigns VY to VX", () => {
        var cpu = makeCpu();
        cpu.V[2] = 0x2a;
        cpu.run(0x8120);
        assert.equal(cpu.V[1], 0x2a);
    });

    t.test("8XY1 OR", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0xf0;
        cpu.V[2] = 0x0f;
        cpu.run(0x8121);
        assert.equal(cpu.V[1], 0xff);
    });

    t.test("8XY2 AND", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0xf0;
        cpu.V[2] = 0x0f;
        cpu.run(0x8122);
        assert.equal(cpu.V[1], 0x00);
    });

    t.test("8XY3 XOR", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0xf0;
        cpu.V[2] = 0x0f;
        cpu.run(0x8123);
        assert.equal(cpu.V[1], 0xff);
    });

    t.test("8XY4 ADD sets VF on carry", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0xff;
        cpu.V[2] = 0x01;
        cpu.run(0x8124);
        assert.equal(cpu.V[1], 0x00);
        assert.equal(cpu.V[0xf], 1);
        cpu.V[1] = 0x10;
        cpu.V[2] = 0x20;
        cpu.V[0xf] = 0;
        cpu.run(0x8124);
        assert.equal(cpu.V[1], 0x30);
        assert.equal(cpu.V[0xf], 0);
    });

    t.test("8XY5 SUB sets VF when there is no borrow", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0x05;
        cpu.V[2] = 0x07;
        cpu.run(0x8125);
        assert.equal(cpu.V[1], 0xfe); // (5 - 7) mod 256
        assert.equal(cpu.V[0xf], 0);
        cpu.V[1] = 0x07;
        cpu.V[2] = 0x05;
        cpu.run(0x8125);
        assert.equal(cpu.V[1], 0x02);
        assert.equal(cpu.V[0xf], 1);
    });

    t.test("8XY6 SHR shifts right, VF = old LSB", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0x81;
        cpu.run(0x8106);
        assert.equal(cpu.V[1], 0x40);
        assert.equal(cpu.V[0xf], 1);
        cpu.V[1] = 0x80;
        cpu.run(0x8106);
        assert.equal(cpu.V[1], 0x40);
        assert.equal(cpu.V[0xf], 0);
    });

    t.test("8XY7 SUBN computes VY - VX", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0x05;
        cpu.V[2] = 0x07;
        cpu.run(0x8127);
        assert.equal(cpu.V[1], 0x2);
        assert.equal(cpu.V[0xf], 1);
        cpu.V[1] = 0x07;
        cpu.V[2] = 0x05;
        cpu.run(0x8127);
        assert.equal(cpu.V[1], 0xfe); // (5 - 7) mod 256
        assert.equal(cpu.V[0xf], 0);
    });

    t.test("8XYE SHL shifts left, VF = old MSB", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0x80;
        cpu.run(0x810e);
        assert.equal(cpu.V[1], 0x00);
        assert.equal(cpu.V[0xf], 1);
        cpu.V[1] = 0x7f;
        cpu.run(0x810e);
        assert.equal(cpu.V[1], 0xfe);
        assert.equal(cpu.V[0xf], 0);
    });

    t.test("unknown 8XYn leaves state alone and advances pc", () => {
        var cpu = makeCpu();
        cpu.V[1] = 0x11;
        loadWords(cpu, [0x8128, 0x6001]);
        var line = cpu.step();
        assert.equal(line, "200:8128 !!! Unknown op code !!!");
        assert.equal(cpu.V[1], 0x11);
        assert.equal(cpu.pc, 0x202);
        cpu.step();
        assert.equal(cpu.V[0], 1);
    });
});

test("ANNN / CXNN", (t) => {
    t.test("ANNN sets I", () => {
        var cpu = makeCpu();
        cpu.run(0xa250);
        assert.equal(cpu.I, 0x250);
    });

    t.test("CXNN ANDs a random byte with NN", () => {
        var cpu = makeCpu();
        withRandom(0.5, function () {
            cpu.run(0xc0ff); // floor(0.5 * 256) = 128
            assert.equal(cpu.V[0], 128);
        });
        withRandom(0.999999, function () {
            cpu.run(0xc00f); // floor(0.999999 * 256) = 255
            assert.equal(cpu.V[0], 255 & 0x0f);
        });
        withRandom(0, function () {
            cpu.run(0xc0ff);
            assert.equal(cpu.V[0], 0);
        });
    });
});

test("DXYN draws sprites", (t) => {
    t.test("toggles pixels and sets VF on collision", () => {
        var cpu = makeCpu();
        cpu.I = 0x300;
        cpu.memory[0x300] = 0x80;
        cpu.run(0xd011);
        assert.equal(cpu.screen[0], 1);
        assert.equal(cpu.V[0xf], 0);
        cpu.run(0xd011);
        assert.equal(cpu.screen[0], 0);
        assert.equal(cpu.V[0xf], 1);
    });

    t.test("wraps around screen edges", () => {
        var cpu = makeCpu();
        cpu.I = 0x300;
        cpu.memory[0x300] = 0x01; // right-most bit, col 7
        cpu.V[0] = 63;
        cpu.V[1] = 31;
        cpu.run(0xd011);
        assert.equal(cpu.screen[31 * 64 + (63 + 7) % 64], 1);
    });

    t.test("draws multi-row sprites from I", () => {
        var cpu = makeCpu();
        cpu.I = 0x300;
        cpu.memory[0x300] = 0x80;
        cpu.memory[0x301] = 0x20;
        cpu.run(0xd012);
        assert.equal(cpu.screen[0 * 64 + 0], 1);
        assert.equal(cpu.screen[1 * 64 + 2], 1);
        assert.equal(cpu.V[0xf], 0);
    });
});

test("font rendering", (t) => {
    var NAMES = "0123456789ABCDEF";

    // Expected on-screen layout of each glyph, one string per row, columns
    // left to right. Hard-coded independently of the font data so this pins
    // both the fontset bytes and the MSB-is-leftmost-pixel convention used
    // by DXYN.
    var EXPECTED = [
        ["####....", "#..#....", "#..#....", "#..#....", "####...."], // 0
        ["..#.....", ".##.....", "..#.....", "..#.....", ".###...."], // 1
        ["####....", "...#....", "####....", "#.......", "####...."], // 2
        ["####....", "...#....", "####....", "...#....", "####...."], // 3
        ["#..#....", "#..#....", "####....", "...#....", "...#...."], // 4
        ["####....", "#.......", "####....", "...#....", "####...."], // 5
        ["####....", "#.......", "####....", "#..#....", "####...."], // 6
        ["####....", "...#....", "..#.....", ".#......", ".#......"], // 7
        ["####....", "#..#....", "####....", "#..#....", "####...."], // 8
        ["####....", "#..#....", "####....", "...#....", "####...."], // 9
        ["####....", "#..#....", "####....", "#..#....", "#..#...."], // A
        ["#.......", "####....", "#.......", "####....", "#......."], // B
        ["###.....", "#..#....", "#.......", "#..#....", "###....."], // C
        ["#.......", "##......", "#.#.....", "#..#....", "#......."], // D
        ["####....", "#.......", "#.......", "#.......", "####...."], // E
        ["####....", "#.......", "#.......", "#.......", "#......."]  // F
    ];

    function litInPattern(pattern) {
        var n = 0;
        pattern.forEach(function (line) {
            for (var i = 0; i < line.length; i++)
                if (line[i] === "#")
                    n++;
        });
        return n;
    }

    // Draws glyph g (0-F) at (x, y) via FX29 + DXYN, returns the cpu.
    function drawGlyph(cpu, g, x, y) {
        cpu.V[1] = g;
        cpu.run(0xf129); // I = 0x50 + g
        cpu.V[0] = x;
        cpu.V[1] = y;
        cpu.run(0xd015); // 5-row sprite at (V0, V1)
    }

    function cellAt(cpu, x, y) {
        var grid = [], r, c;
        for (r = 0; r < 5; r++) {
            var line = "";
            for (c = 0; c < 8; c++)
                line += cpu.screen[(y + r) * 64 + (x + c)] ? "#" : ".";
            grid.push(line);
        }
        return grid;
    }

    t.test("renders every glyph pixel-exact", () => {
        for (var g = 0; g < 16; g++) {
            var cpu = makeCpu();
            drawGlyph(cpu, g, 0, 0);
            assert.deepEqual(cellAt(cpu, 0, 0), EXPECTED[g], "glyph '" + NAMES[g] + "'");
        }
    });

    t.test("glyphs light only the pixels inside their 8x5 cell", () => {
        for (var g = 0; g < 16; g++) {
            var cpu = makeCpu();
            drawGlyph(cpu, g, 0, 0);
            assert.equal(screenPixels(cpu), litInPattern(EXPECTED[g]), "glyph '" + NAMES[g] + "'");
        }
    });

    t.test("draws a BCD number digit by digit (FX33 + FX29 + DXYN)", () => {
        // The sequence brick.ch8 / airplane.ch8 use to display a number.
        var cpu = makeCpu();
        cpu.I = 0x400;
        cpu.V[0] = 58;
        cpu.run(0xf033); // BCD of 58 -> 0, 5, 8 at 0x400..0x402
        assert.deepEqual([cpu.memory[0x400], cpu.memory[0x401], cpu.memory[0x402]], [0, 5, 8]);

        var d;
        for (d = 0; d < 3; d++) {
            cpu.I = 0x400 + d;
            cpu.V[1] = cpu.memory[cpu.I];
            cpu.run(0xf129);
            cpu.V[0] = d * 10; // 8px glyph + 2px gap
            cpu.V[1] = 0;
            cpu.run(0xd015);
        }

        assert.deepEqual(cellAt(cpu, 0, 0), EXPECTED[0]); // "0"
        assert.deepEqual(cellAt(cpu, 10, 0), EXPECTED[5]); // "5"
        assert.deepEqual(cellAt(cpu, 20, 0), EXPECTED[8]); // "8"
        assert.equal(screenPixels(cpu), litInPattern(EXPECTED[0]) + litInPattern(EXPECTED[5]) + litInPattern(EXPECTED[8])); // nothing else lit
    });
});

test("EX9E / EXA1 key skips", (t) => {
    function runKeySkip(opcode, pressed) {
        var cpu = makeCpu();
        cpu.V[0] = 0x0a;
        if (pressed)
            cpu.keyDown("A");
        loadWords(cpu, [opcode, 0x60aa]);
        cpu.step();
        var pcAfterSkip = cpu.pc;
        if (pcAfterSkip === 0x202)
            cpu.step(); // execute the marker
        return { cpu: cpu, pcAfterSkip: pcAfterSkip };
    }

    t.test("EX9E skips when key in VX is pressed", () => {
        var r = runKeySkip(0xe09e, true);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 0x0a);
    });

    t.test("EX9E falls through when key is not pressed", () => {
        var r = runKeySkip(0xe09e, false);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });

    t.test("EXA1 skips when key in VX is not pressed", () => {
        var r = runKeySkip(0xe0a1, false);
        assert.equal(r.pcAfterSkip, 0x204);
        assert.equal(r.cpu.V[0], 0x0a);
    });

    t.test("EXA1 falls through when key is pressed", () => {
        var r = runKeySkip(0xe0a1, true);
        assert.equal(r.pcAfterSkip, 0x202);
        assert.equal(r.cpu.V[0], 0xaa);
    });
});

test("FXNN extended ops", (t) => {
    t.test("FX07 reads the delay timer", () => {
        var cpu = makeCpu();
        cpu.delayTimer = 5;
        cpu.run(0xf007);
        assert.equal(cpu.V[0], 5);
    });

    t.test("FX0A waits for a key press into VX", () => {
        var cpu = makeCpu();
        var line = cpu.run(0xf10a);
        assert.equal(cpu.waitingForKey, true);
        assert.equal(cpu.keyTarget, 1);
        assert.ok(line.indexOf("Waits for a key press") !== -1);
        var msg = cpu.keyDown("C");
        assert.equal(cpu.V[1], 0x0c);
        assert.equal(cpu.waitingForKey, false);
        assert.ok(msg.indexOf("Key wait: V1 = c") !== -1);
    });

    t.test("FX15 / FX18 set timers, tickTimers decrements them", () => {
        var cpu = makeCpu();
        cpu.V[0] = 7;
        cpu.run(0xf015);
        assert.equal(cpu.delayTimer, 7);
        cpu.V[0] = 3;
        cpu.run(0xf018);
        assert.equal(cpu.soundTimer, 3);
        cpu.tickTimers();
        assert.equal(cpu.delayTimer, 6);
        assert.equal(cpu.soundTimer, 2);
    });

    t.test("timers never go below zero", () => {
        var cpu = makeCpu();
        cpu.tickTimers();
        assert.equal(cpu.delayTimer, 0);
        assert.equal(cpu.soundTimer, 0);
    });

    t.test("FX1E adds VX to I and wraps at 0xfff", () => {
        var cpu = makeCpu();
        cpu.I = 0xffe;
        cpu.V[0] = 3;
        cpu.run(0xf01e);
        assert.equal(cpu.I, 0x001);
    });

    t.test("FX29 points I at the font sprite of the low nibble of VX", () => {
        var cpu = makeCpu();
        cpu.V[0] = 0x0a;
        cpu.run(0xf029);
        assert.equal(cpu.I, 0x50 + 10 * 5); // 0x82: glyph 'A'
        cpu.V[0] = 0x1a;
        cpu.run(0xf029);
        assert.equal(cpu.I, 0x82);
        cpu.V[0] = 0x0f;
        cpu.run(0xf029);
        assert.equal(cpu.I, 0x50 + 15 * 5); // 0x9b: glyph 'F'
    });

    t.test("FX33 stores the BCD of VX at I", () => {
        var cpu = makeCpu();
        cpu.I = 0x300;
        cpu.V[0] = 0;
        cpu.run(0xf033);
        assert.deepEqual([cpu.memory[0x300], cpu.memory[0x301], cpu.memory[0x302]], [0, 0, 0]);
        cpu.V[0] = 5;
        cpu.run(0xf033);
        assert.deepEqual([cpu.memory[0x300], cpu.memory[0x301], cpu.memory[0x302]], [0, 0, 5]);
        cpu.V[0] = 255;
        cpu.run(0xf033);
        assert.deepEqual([cpu.memory[0x300], cpu.memory[0x301], cpu.memory[0x302]], [2, 5, 5]);
    });

    t.test("FX55 / FX65 store and restore registers", () => {
        var cpu = makeCpu();
        cpu.V[0] = 1;
        cpu.V[1] = 2;
        cpu.V[2] = 3;
        cpu.I = 0x300;
        cpu.run(0xf255);
        assert.deepEqual([cpu.memory[0x300], cpu.memory[0x301], cpu.memory[0x302]], [1, 2, 3]);
        // wipe the registers, then restore them from memory
        cpu.V[0] = 0;
        cpu.V[1] = 0;
        cpu.V[2] = 0;
        cpu.run(0xf265);
        assert.deepEqual([cpu.V[0], cpu.V[1], cpu.V[2]], [1, 2, 3]);
    });

    t.test("unknown FXNN is reported", () => {
        var cpu = makeCpu();
        assert.equal(cpu.run(0xf000), "!!! Unknown op code !!!");
    });
});

test("keyDown / keyUp / isKeyPressed", (t) => {
    t.test("tracks pressed keys by hex name", () => {
        var cpu = makeCpu();
        assert.equal(cpu.isKeyPressed(0x0a), false);
        cpu.keyDown("A");
        assert.equal(cpu.isKeyPressed(0x0a), true);
        cpu.keyUp("A");
        assert.equal(cpu.isKeyPressed(0x0a), false);
    });

    t.test("returns null for ordinary key presses", () => {
        var cpu = makeCpu();
        assert.equal(cpu.keyDown("1"), null);
    });
});

test("keyboard: physical key codes map to chip-8 keys (keymap.js)", (t) => {
    t.test("top number row maps 1:1 to chip-8 keys 1-0", () => {
        var expected = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
        for (var i = 0; i < expected.length; i++) {
            var code = i === 9 ? "Digit0" : "Digit" + (i + 1);
            assert.equal(keyMap[code], expected[i]);
        }
    });

    t.test("numpad number keys map 1:1 to chip-8 keys 1-0", () => {
        var expected = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
        for (var i = 0; i < expected.length; i++) {
            var code = i === 9 ? "Numpad0" : "Numpad" + (i + 1);
            assert.equal(keyMap[code], expected[i]);
        }
    });

    t.test("letter keys map to chip-8 keys A-F", () => {
        assert.equal(keyMap["KeyA"], "A");
        assert.equal(keyMap["KeyB"], "B");
        assert.equal(keyMap["KeyC"], "C");
        assert.equal(keyMap["KeyD"], "D");
        assert.equal(keyMap["KeyE"], "E");
        assert.equal(keyMap["KeyF"], "F");
    });

    t.test("pressing physical 4 (top row or numpad) reaches the CPU as chip-8 key 4", () => {
        ["Digit4", "Numpad4"].forEach(function (code) {
            var cpu = makeCpu();
            var k = keyMap[code];
            assert.equal(k, "4");
            cpu.keyDown(k);
            assert.equal(cpu.isKeyPressed(0x04), true);
            cpu.keyUp(k);
            assert.equal(cpu.isKeyPressed(0x04), false);
        });
    });
});

test("step() mechanics", (t) => {
    t.test("executes one opcode and advances pc by 2", () => {
        var cpu = makeCpu();
        loadWords(cpu, [0x6001]);
        var line = cpu.step();
        assert.equal(line, "200:6001 Sets V0 to 1");
        assert.equal(cpu.V[0], 1);
        assert.equal(cpu.pc, 0x202);
    });

    t.test("masks pc to 12 bits", () => {
        var cpu = makeCpu();
        setWord(cpu, 0x200, 0x6002);
        cpu.pc = 0x1200;
        var line = cpu.step();
        assert.ok(line.indexOf("200:6002") === 0);
        assert.equal(cpu.V[0], 2);
    });

    t.test("resets and reports when pc is not a number", () => {
        var cpu = makeCpu();
        cpu.V[0] = 9;
        cpu.screen[5] = 1;
        cpu.pc = NaN;
        var line = cpu.step();
        assert.ok(line.indexOf("!!! Fatal") === 0);
        assert.equal(cpu.pc, 0x200);
        assert.equal(cpu.V[0], 0);
        assert.equal(screenPixels(cpu), 0);
    });
});

test("integration: runs maze1.ch8 from the roms directory to its end loop", () => {
    var original = Math.random;
    Math.random = function () { return 0.5; }; // V2 = 128 & 1 = 0 -> deterministic
    try {
        var cpu = makeCpu();
        cpu.loadRom(roms.loadRomFile('maze1.ch8'));
        for (var i = 0; i < 1100; i++) {
            cpu.tickTimers();
            cpu.step();
        }
        assert.equal(cpu.pc, 0x21c); // designed self-loop at end of program
        assert.equal(cpu.V[1], 0x20);
        // 16 tiles x 8 rows x 4 pixels with no overlaps -> exact count
        assert.equal(screenPixels(cpu), 512);
        assert.equal(cpu.screen[0], 1);
        assert.equal(cpu.screen[31 * 64 + 63], 1);
    } finally {
        Math.random = original;
    }
});

// brick.ch8 keeps the paddle x in V12 and polls chip-8 keys 4 (left) and
// 6 (right) each frame with EXA1. Running ~1100 steps with a fixed RNG gets
// past the intro animation and into the game loop, where V12 starts centred.
function runBrickToGameLoop() {
    var cpu = makeCpu();
    cpu.loadRom(roms.loadRomFile('brick.ch8'));
    for (var i = 0; i < 1100; i++) {
        cpu.tickTimers();
        cpu.step();
    }
    return cpu;
}

test("integration: brick.ch8 paddle responds to key presses", (t) => {
    t.test("pressing physical 4 moves the paddle left (V12 decreases)", () => {
        withRandom(0.5, () => {
            var cpu = runBrickToGameLoop();
            var start = cpu.V[12];
            cpu.keyDown(keyMap["Digit4"]); // physical "4" -> chip-8 key 4
            for (var i = 0; i < 100; i++) {
                cpu.tickTimers();
                cpu.step();
            }
            cpu.keyUp(keyMap["Digit4"]);
            assert.ok(cpu.V[12] < start,
                "paddle should move left, V12 " + start + " -> " + cpu.V[12]);
        });
    });

    t.test("pressing physical 6 moves the paddle right (V12 increases)", () => {
        withRandom(0.5, () => {
            var cpu = runBrickToGameLoop();
            var start = cpu.V[12];
            cpu.keyDown(keyMap["Digit6"]); // physical "6" -> chip-8 key 6
            for (var i = 0; i < 100; i++) {
                cpu.tickTimers();
                cpu.step();
            }
            cpu.keyUp(keyMap["Digit6"]);
            assert.ok(cpu.V[12] > start,
                "paddle should move right, V12 " + start + " -> " + cpu.V[12]);
        });
    });

    t.test("with no keys the paddle stays put (V12 unchanged)", () => {
        withRandom(0.5, () => {
            var cpu = runBrickToGameLoop();
            var start = cpu.V[12];
            for (var i = 0; i < 100; i++) {
                cpu.tickTimers();
                cpu.step();
            }
            assert.equal(cpu.V[12], start);
        });
    });
});
