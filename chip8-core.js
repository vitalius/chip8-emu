// Chip-8 emulation core. No DOM: in the browser this exposes a global
// Chip8, in Node it is required as a module.

var FONT = [
    0x1c, 0x22, 0x22, 0x22, 0x1c,
    0x04, 0x04, 0x08, 0x10, 0x08,
    0x14, 0x08, 0x1c, 0x02, 0x1e,
    0x14, 0x08, 0x08, 0x18, 0x14,
    0x04, 0x0c, 0x14, 0x04, 0x04,
    0x1c, 0x08, 0x1c, 0x08, 0x08,
    0x1c, 0x10, 0x1c, 0x08, 0x10,
    0x14, 0x08, 0x04, 0x02, 0x02,
    0x1c, 0x08, 0x08, 0x08, 0x1c,
    0x1c, 0x08, 0x1c, 0x08, 0x10,
    0x1c, 0x10, 0x10, 0x10, 0x1c,
    0x08, 0x1c, 0x08, 0x1c, 0x08,
    0x06, 0x0c, 0x0c, 0x0c, 0x06,
    0x10, 0x12, 0x14, 0x18, 0x10,
    0x1e, 0x08, 0x08, 0x08, 0x08,
    0x0e, 0x08, 0x08, 0x08, 0x08
];

function Chip8() {
    this.reset();
}

Chip8.prototype.reset = function (rom) {
    this.memory = new Uint8Array(4096);
    var i;
    for (i = 0; i < FONT.length; i++)
        this.memory[0x50 + i] = FONT[i];
    if (rom)
        this.loadRom(rom);

    this.V = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.I = 0x0;
    this.pc = 0x200;

    this.stack = new Array(16);
    this.sp = 0;

    this.delayTimer = 0;
    this.soundTimer = 0;

    this.screen = new Uint8Array(64 * 32);

    this.keys = {};
    this.waitingForKey = false;
    this.keyTarget = 0;
    this.pcHeld = false;
};

Chip8.prototype.loadRom = function (rom) {
    var i;
    for (i = 0; i < rom.length; i++)
        this.memory[0x200 + i] = rom[i];
};

Chip8.prototype.keyDown = function (key) {
    this.keys[key] = true;
    if (this.waitingForKey) {
        this.V[this.keyTarget] = parseInt(key, 16);
        this.waitingForKey = false;
        return "Key wait: V" + this.keyTarget + " = " + this.V[this.keyTarget].toString(16);
    }
    return null;
};

Chip8.prototype.keyUp = function (key) {
    this.keys[key] = false;
};

Chip8.prototype.isKeyPressed = function (key) {
    return this.keys[key.toString(16).toUpperCase()] === true;
};

Chip8.prototype.drawSprite = function (xReg, yReg, rows) {
    var x = this.V[xReg] % 64;
    var y = this.V[yReg] % 32;
    this.V[0xf] = 0;
    var row, col, byte, px, py;
    for (row = 0; row < rows; row++) {
        byte = this.memory[(this.I + row) & 0xfff];
        for (col = 0; col < 8; col++) {
            if (byte & (0x80 >> col)) {
                px = (x + col) % 64;
                py = (y + row) % 32;
                if (this.screen[py * 64 + px])
                    this.V[0xf] = 1;
                this.screen[py * 64 + px] ^= 1;
            }
        }
    }
    return "Draws " + rows + " row sprite from I (" + this.I.toString(16) + ") at (" + x + "," + y + "), VF = " + this.V[0xf];
};

Chip8.prototype.run = function (opcode) {
    var op = opcode >> 12;
    var X = (opcode >> 8) & 0xf;
    var Y = (opcode >> 4) & 0xf;
    var N = opcode & 0xff;
    var NNN = opcode & 0xfff;

    switch (op) {
        case 0x0:
            // 00E0    Clears the screen.
            if (opcode == 0x00e0) {
                this.screen.fill(0);
                return "Clears the screen";
            }

            // 00EE    Returns from a subroutine.
            if (opcode == 0x00ee) {
                this.sp = (this.sp - 1 + 16) % 16;
                this.pc = this.stack[this.sp];
                this.pcHeld = true;
                return "Returns from a subroutine to " + this.pc.toString(16);
            }
            break;

        // 1NNN    Jumps to address NNN.
        case 0x1:
            this.pc = NNN;
            this.pcHeld = true;
            return "Jumps to address " + NNN.toString(16);

        // 2NNN    Calls subroutine at NNN.
        case 0x2:
            this.stack[this.sp] = this.pc + 2;
            this.sp = (this.sp + 1) % 16;
            this.pc = NNN;
            this.pcHeld = true;
            return "Calls subroutine at " + NNN.toString(16);

        // 3XNN    Skips the next instruction if VX equals NN.
        case 0x3:
            if (this.V[X] == N)
                this.pc += 2;
            return "Skips the next instruction if V" + X + " (" + this.V[X].toString(16) + ") equals " + N.toString(16);

        // 4XNN    Skips the next instruction if VX doesn't equal NN.
        case 0x4:
            if (this.V[X] != N)
                this.pc += 2;
            return "Skips the next instruction if V" + X + " (" + this.V[X].toString(16) + ") doesn't equal " + N.toString(16);

        // 5XY0    Skips the next instruction if VX equals VY.
        case 0x5:
            if ((opcode & 0xf) == 0 && this.V[X] == this.V[Y])
                this.pc += 2;
            return "Skips the next instruction if V" + X + " (" + this.V[X].toString(16) + ") equals V" + Y + " (" + this.V[Y].toString(16) + ")";

        // 6XNN    Sets VX to NN.
        case 0x6:
            this.V[X] = N;
            return "Sets V" + X + " to " + N.toString(16);

        // 7XNN    Adds NN to VX.
        case 0x7:
            this.V[X] = (this.V[X] + N) & 0xff;
            return "Adds " + N.toString(16) + " to V" + X + ", V" + X + " = " + this.V[X].toString(16);

        // 8XYn    Bitwise and arithmetic operations.
        case 0x8:
            switch (opcode & 0xf) {
                // 8XY0    Sets VX to the value of VY.
                case 0x0:
                    this.V[X] = this.V[Y];
                    return "Sets V" + X + " to the value of V" + Y;
                // 8XY1    Sets VX to VX or VY.
                case 0x1:
                    this.V[X] = this.V[X] | this.V[Y];
                    return "Sets V" + X + " to V" + X + " or V" + Y + ", V" + X + " = " + this.V[X].toString(16);
                // 8XY2    Sets VX to VX and VY.
                case 0x2:
                    this.V[X] = this.V[X] & this.V[Y];
                    return "Sets V" + X + " to V" + X + " and V" + Y + ", V" + X + " = " + this.V[X].toString(16);
                // 8XY3    Sets VX to VX xor VY.
                case 0x3:
                    this.V[X] = this.V[X] ^ this.V[Y];
                    return "Sets V" + X + " to V" + X + " xor V" + Y + ", V" + X + " = " + this.V[X].toString(16);
                // 8XY4    Adds VY to VX. VF is set to 1 when there's a carry, and to 0 when there isn't.
                case 0x4: {
                    var sum = this.V[X] + this.V[Y];
                    this.V[0xf] = (sum & 0x100) ? 1 : 0;
                    this.V[X] = sum & 0xff;
                    return "Adds V" + Y + " to V" + X + ", V" + X + " = " + this.V[X].toString(16) + ", VF = " + this.V[0xf];
                }
                // 8XY5    VY is subtracted from VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
                case 0x5:
                    this.V[0xf] = (this.V[X] >= this.V[Y]) ? 1 : 0;
                    this.V[X] = (this.V[X] - this.V[Y]) & 0xff;
                    return "Subtracts V" + Y + " from V" + X + ", V" + X + " = " + this.V[X].toString(16) + ", VF = " + this.V[0xf];
                // 8XY6    Shifts VX right by one. VF is set to the value of the least significant bit of VX before the shift.
                case 0x6:
                    this.V[0xf] = this.V[X] & 1;
                    this.V[X] = this.V[X] >> 1;
                    return "Shifts V" + X + " right by one, V" + X + " = " + this.V[X].toString(16) + ", VF = " + this.V[0xf];
                // 8XY7    Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
                case 0x7:
                    this.V[0xf] = (this.V[Y] >= this.V[X]) ? 1 : 0;
                    this.V[X] = (this.V[Y] - this.V[X]) & 0xff;
                    return "Subtracts V" + X + " from V" + Y + ", V" + X + " = " + this.V[X].toString(16) + ", VF = " + this.V[0xf];
                // 8XYE    Shifts VX left by one. VF is set to the value of the most significant bit of VX before the shift.
                case 0xe:
                    this.V[0xf] = (this.V[X] & 0x80) ? 1 : 0;
                    this.V[X] = (this.V[X] << 1) & 0xff;
                    return "Shifts V" + X + " left by one, V" + X + " = " + this.V[X].toString(16) + ", VF = " + this.V[0xf];
            }
            break;

        // 9XY0    Skips the next instruction if VX doesn't equal VY.
        case 0x9:
            if (this.V[X] != this.V[Y])
                this.pc += 2;
            return "Skips the next instruction if V" + X + " (" + this.V[X].toString(16) + ") doesn't equal V" + Y + " (" + this.V[Y].toString(16) + ")";

        // ANNN    Sets I to the address NNN.
        case 0xa:
            this.I = NNN;
            return "Sets I to the address " + NNN.toString(16);

        // BNNN    Jumps to the address NNN plus V0.
        case 0xb:
            this.pc = NNN + this.V[0];
            this.pcHeld = true;
            return "Jumps to address " + this.pc.toString(16) + " (NNN + V0)";

        // CXNN    Sets VX to the result of a bitwise and operation on a random number and NN.
        case 0xc:
            this.V[X] = Math.floor(Math.random() * 256) & N;
            return "Sets V" + X + " to a random number and " + N.toString(16) + ", V" + X + " = " + this.V[X].toString(16);

        // DXYN    Draws a sprite at position (VX, VY) in memory at I.
        case 0xd:
            return this.drawSprite(X, Y, N & 0xf);

        // EX9E    Skips the next instruction if the key stored in VX is pressed.
        // EXA1    Skips the next instruction if the key stored in VX isn't pressed.
        case 0xe:
            if (N == 0x9e) {
                if (this.isKeyPressed(this.V[X]))
                    this.pc += 2;
                return "Skips the next instruction if key V" + X + " (" + (this.V[X] & 0xf).toString(16) + ") is pressed";
            }
            if (N == 0xa1) {
                if (!this.isKeyPressed(this.V[X]))
                    this.pc += 2;
                return "Skips the next instruction if key V" + X + " (" + (this.V[X] & 0xf).toString(16) + ") isn't pressed";
            }
            break;

        // FXNN    Extended operations.
        case 0xf:
            switch (N) {
                // FX07    Sets VX to the value of the delay timer.
                case 0x07:
                    this.V[X] = this.delayTimer;
                    return "Sets V" + X + " to the value of the delay timer (" + this.delayTimer + ")";
                // FX0A    A key press is awaited, and then stored in VX.
                case 0x0a:
                    this.waitingForKey = true;
                    this.keyTarget = X;
                    return "Waits for a key press to be stored in V" + X;
                // FX15    Sets the delay timer to VX.
                case 0x15:
                    this.delayTimer = this.V[X];
                    return "Sets the delay timer to V" + X + " (" + this.V[X] + ")";
                // FX18    Sets the sound timer to VX.
                case 0x18:
                    this.soundTimer = this.V[X];
                    return "Sets the sound timer to V" + X + " (" + this.V[X] + ")";
                // FX1E    Adds VX to I.
                case 0x1e:
                    this.I = (this.I + this.V[X]) & 0xfff;
                    return "Adds V" + X + " to I, I = " + this.I.toString(16);
                // FX29    Sets I to the location of the sprite for the character in VX.
                case 0x29:
                    this.I = 0x50 + (this.V[X] & 0xf);
                    return "Sets I to the sprite for the character in V" + X + " (" + (this.V[X] & 0xf).toString(16) + "), I = " + this.I.toString(16);
                // FX33    Stores the BCD representation of VX at I, I+1, I+2.
                case 0x33:
                    this.memory[this.I] = Math.floor(this.V[X] / 100);
                    this.memory[this.I + 1] = Math.floor(this.V[X] / 10) % 10;
                    this.memory[this.I + 2] = this.V[X] % 10;
                    return "Stores the BCD of V" + X + " (" + this.V[X] + ") at I (" + this.I.toString(16) + "), I+1, I+2";
                // FX55    Stores V0 to VX in memory starting at address I.
                case 0x55: {
                    var i;
                    for (i = 0; i <= X; i++)
                        this.memory[this.I + i] = this.V[i];
                    return "Stores V0..V" + X + " in memory starting at I (" + this.I.toString(16) + ")";
                }
                // FX65    Fills V0 to VX with values from memory starting at address I.
                case 0x65: {
                    var j;
                    for (j = 0; j <= X; j++)
                        this.V[j] = this.memory[this.I + j];
                    return "Fills V0..V" + X + " with values from memory starting at I (" + this.I.toString(16) + ")";
                }
            }
            break;
    }

    return "!!! Unknown op code !!!";
};

Chip8.prototype.step = function () {
    if (!isFinite(this.pc)) {
        var msg = "!!! Fatal: pc is not a number (" + this.pc + "), resetting !!!";
        this.reset();
        return msg;
    }
    this.pc &= 0xfff;
    var addr = this.pc;
    var opcode = (this.memory[this.pc] << 8) | this.memory[this.pc + 1];
    var desc = this.run(opcode);
    var line = addr.toString(16) + ":" + opcode.toString(16) + " " + desc;
    if (!this.pcHeld)
        this.pc += 2;
    this.pcHeld = false;
    return line;
};

Chip8.prototype.tickTimers = function () {
    if (this.delayTimer > 0)
        this.delayTimer -= 1;
    if (this.soundTimer > 0)
        this.soundTimer -= 1;
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Chip8;
}
