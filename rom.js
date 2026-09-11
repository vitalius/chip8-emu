// Loads Chip-8 ROM files from the roms/ directory as byte arrays
// (big-endian) for loading at 0x200.

var ROMS = [ 'maze1.ch8', 'maze2.ch8', 'particle.ch8', 'sierpinski.ch8', 'space-inv.ch8', 'cave.ch8', 'brick.ch8', 'airplane.ch8'];
var DEFAULT_ROM = 'maze1.ch8';

var loadRomFile;

if (typeof module !== 'undefined' && module.exports) {
    // Node: read straight from the roms/ directory (used by the tests).
    var fs = require('fs');
    var path = require('path');

    loadRomFile = function (name) {
        var romPath = path.join(__dirname, 'roms', name);
        return new Uint8Array(fs.readFileSync(romPath));
    };

    module.exports = { ROMS: ROMS, DEFAULT_ROM: DEFAULT_ROM, loadRomFile: loadRomFile };
} else {
    // Browser: fetch the ROM from the roms/ directory, relative to the page
    // URL. Requires serving the directory over HTTP (e.g. npx http-server).
    loadRomFile = function (name) {
        return fetch('roms/' + name).then(function (res) {
            if (!res.ok)
                throw new Error('Could not load ' + name + ' (HTTP ' + res.status + '). ' +
                    'Serve the directory over HTTP, e.g. npx http-server');
            return res.arrayBuffer();
        }).then(function (buffer) {
            return new Uint8Array(buffer);
        });
    };
}
