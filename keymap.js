// Maps physical keyboard event codes (KeyboardEvent.code) to the 16 Chip-8
// key names. The top number row and the numpad both map 1:1 to Chip-8 keys
// 1-0 and the first six letter keys map to A-F, so every Chip-8 key is
// reachable. Numpad codes are physical, so they fire whenever a numpad is
// present, regardless of layout or NumLock state.

var keyMap = {
    "Digit1": "1", "Digit2": "2", "Digit3": "3", "Digit4": "4", "Digit5": "5",
    "Digit6": "6", "Digit7": "7", "Digit8": "8", "Digit9": "9", "Digit0": "0",
    "Numpad1": "1", "Numpad2": "2", "Numpad3": "3", "Numpad4": "4", "Numpad5": "5",
    "Numpad6": "6", "Numpad7": "7", "Numpad8": "8", "Numpad9": "9", "Numpad0": "0",
    "KeyA": "A", "KeyB": "B", "KeyC": "C", "KeyD": "D", "KeyE": "E", "KeyF": "F"
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = keyMap;
}
