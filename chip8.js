var pc;

var rom = [ 0x6000, 0x6100, 0xa222, 0xc201, 0x3201, 0xa21e, 0xd014, 0x7004,
    0x3040, 0x1204, 0x6000, 0x7104, 0x3120, 0x1204, 0x121c, 0x8040,
    0x2010, 0x2040, 0x8010, 0xa21e, 0xc201, 0x3201, 0xa21a, 0xd014,
    0x7004, 0x3040, 0x1200, 0x6000, 0x7104, 0x3120, 0x1200, 0x1218,
    0x8040, 0x2010, 0x2040, 0x8010 ];


var V = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
var I = 0x0

pc = 0x200
rom.forEach(
    function (b) {
        log(pc.toString(16) + ":" + b.toString(16) + " " + run(b));
        pc += 0x08
    }
);


function run(opcode) {
    
    // 00E0    Clears the screen.
    if (opcode == 0x00E0)
        return "Clears the screen";
    
    // 00EE    Returns from a subroutine.
    
    // 1NNN    Jumps to address NNN.
    if (opcode >> 12 == 0x1) {
        addr = (opcode & 0xfff);
        pc = addr;
        return "Jumps to address  " + addr.toString(16);
    }
        
    // 2NNN    Calls subroutine at NNN.
    if (opcode >> 12 == 0x2) {
        addr = (opcode & 0xfff);
        pc = addr;
        return "Calls subroutine at " + (opcode & 0xfff).toString(16);
    }

    // 3XNN    Skips the next instruction if VX equals NN.
    if (opcode >> 12 == 0x3) {
        var VX = (opcode & 0xf00 >> 8);
        var NX = opcode & 0xff;
        if (V[VX] == NX)
            pc += 0x08;
        return "Skips the next instruction if V" + VX.toString(16) + " (" + V[VX] + ") equals " + NX.toString(16);
    }

    // 4XNN    Skips the next instruction if VX doesn't equal NN.
    // 5XY0    Skips the next instruction if VX equals VY.
    
    // 6XNN    Sets VX to NN.
    if (opcode >> 12 == 0x6) {
        var VX = opcode & 0xf00;
        var NX = opcode & 0xff;
        V[VX] = NX;
        return "Sets V" + ((opcode & 0xf00) >> 8).toString(16) + " to " + (opcode & 0xff).toString(16);
    }

    // 7XNN    Adds NN to VX.
    if (opcode >> 12 == 0x7)
        return "Adds " + (opcode & 0xff).toString(16) + " to V" + ((opcode & 0xf00) >> 8).toString(16);
    
    // 8XY0    Sets VX to the value of VY.
    if (opcode >> 12 == 0x8 && (opcode & 0xf) == 0x0 )
        return "Sets V" + ((opcode & 0xf00) >> 8).toString(16) + " to the value of V" + ((opcode & 0xf0) >> 4).toString(16);
    
    // 8XY1    Sets VX to VX or VY.
    // 8XY2    Sets VX to VX and VY.
    // 8XY3    Sets VX to VX xor VY.
    // 8XY4    Adds VY to VX. VF is set to 1 when there's a carry, and to 0 when there isn't.
    // 8XY5    VY is subtracted from VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
    // 8XY6    Shifts VX right by one. VF is set to the value of the least significant bit of VX before the shift.[2]
    // 8XY7    Sets VX to VY minus VX. VF is set to 0 when there's a borrow, and 1 when there isn't.
    // 8XYE    Shifts VX left by one. VF is set to the value of the most significant bit of VX before the shift.[2]
    // 9XY0    Skips the next instruction if VX doesn't equal VY.
    
    // ANNN    Sets I to the address NNN.
    if (opcode >> 12 == 0xa) {
        I = opcode & 0xfff;
        return "Sets I to the address " + I.toString(16);    
    }

    // BNNN    Jumps to the address NNN plus V0.
    
    // CXNN    Sets VX to the result of a bitwise and operation on a random number and NN.
    if (opcode >> 12 == 0xc)
        return "Sets V" + ((opcode & 0xf00) >> 8).toString(16) + " to the result of a bitwise and operation on a random number and " + (opcode & 0xff).toString(16);
    
    // DXYN    Sprites stored in memory at location in index register (I), 8bits wide. Wraps around the screen. If when drawn, clears a pixel, register VF is set to 1 otherwise it is zero. All drawing is XOR drawing (i.e. it toggles the screen pixels). Sprites are drawn starting at position VX, VY. N is the number of 8bit rows that need to be drawn. If N is greater than 1, second line continues at position VX, VY+1, and so on.
    if (opcode >> 12 == 0xd)
        return "Draw sprite stored in memory at location in index register (I), 8bits wide at (x,y) V" + ((opcode & 0xf00) >> 8).toString(16) + ",V" + ((opcode & 0xf0) >> 4).toString(16) + " with " + (opcode & 0xf).toString(16) + " rows";
    
    // EX9E    Skips the next instruction if the key stored in VX is pressed.
    // EXA1    Skips the next instruction if the key stored in VX isn't pressed.
    // FX07    Sets VX to the value of the delay timer.
    // FX0A    A key press is awaited, and then stored in VX.
    // FX15    Sets the delay timer to VX.
    // FX18    Sets the sound timer to VX.
    // FX1E    Adds VX to I.[3]
    // FX29    Sets I to the location of the sprite for the character in VX. Characters 0-F (in hexadecimal) are represented by a 4x5 font.
    // FX33    Stores the Binary-coded decimal representation of VX, with the most significant of three digits at the address in I, the middle digit at I plus 1, and the least significant digit at I plus 2. (In other words, take the decimal representation of VX, place the hundreds digit in memory at location in I, the tens digit at location I+1, and the ones digit at location I+2.)
    // FX55    Stores V0 to VX in memory starting at address I.[4]
    // FX65    Fills V0 to VX with values from memory starting at address I.[4]
    
    return "!!! Unknown op code !!!"
};




function log(text) {
    var plog = document.getElementById("log");
    plog.innerHTML += text + "</br>";
};

function debug(t) {
    var debug = document.getElementById("debug");
    debug.innerHTML += t;
};