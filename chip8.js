var cpu = new Chip8();
var currentRom = null;
var romLoadSeq = 0;

function loadRom(name) {
    var seq = ++romLoadSeq;
    loadRomFile(name)
        .then(function (bytes) {
            if (seq !== romLoadSeq)
                return; // stale: a newer ROM was selected while this was loading
            currentRom = bytes;
            cpu.reset(bytes);
            log("Loaded " + name + " (" + bytes.length + " bytes)");
        })
        .catch(function (err) {
            if (seq !== romLoadSeq)
                return;
            log(err.message);
        });
}

var keyMap = {
    "Digit1": "1", "Digit2": "2", "Digit3": "3", "Digit4": "C",
    "Digit5": "4", "Digit6": "5", "Digit7": "6", "Digit8": "D",
    "Digit9": "7", "Digit0": "8",
    "KeyA": "9", "KeyB": "0", "KeyC": "A", "KeyD": "B",
    "KeyE": "C", "KeyF": "D"
};

var canvas;
var ctx;
var lastTime;
var baseStepMs = 1000 / 60;
var SPEEDS = [2, 10, 100, 1000];
var speed = 2; // multiple of the base 60 steps/s rate
var stepMs = baseStepMs / speed;
var running = true;

function render() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = "#fff";
    var x, y;
    for (y = 0; y < 32; y++)
        for (x = 0; x < 64; x++)
            if (cpu.screen[y * 64 + x])
                ctx.fillRect(x, y, 1, 1);
}

function frame(now) {
    if (running) {
        if (now - lastTime > 250)
            lastTime = now - stepMs;
        var steps = 0;
        var logged = 0;
        while (now - lastTime >= stepMs && steps < 1000) {
            lastTime += stepMs;
            cpu.tickTimers();
            if (currentRom && !cpu.waitingForKey) {
                var line = cpu.step();
                if (logged < 10) { // keep the log DOM work bounded at high speeds
                    log(line);
                    logged += 1;
                }
            }
            steps += 1;
        }
    }
    render();
    requestAnimationFrame(frame);
}

function doRun() {
    running = true;
    updateButtons();
}

function doPause() {
    running = false;
    updateButtons();
}

function doReset() {
    if (currentRom)
        cpu.reset(currentRom);
}

function doStep() {
    if (running || !currentRom)
        return;
    cpu.tickTimers();
    if (!cpu.waitingForKey)
        log(cpu.step());
}

function updateButtons() {
    document.getElementById("btn-run").disabled = running;
    document.getElementById("btn-pause").disabled = !running;
    document.getElementById("btn-step").disabled = running;
}

function keyDown(e) {
    if (e.code === "KeyR") {
        if (currentRom)
            cpu.reset(currentRom);
        return;
    }
    var k = keyMap[e.code];
    if (k === undefined)
        return;
    var msg = cpu.keyDown(k);
    if (msg !== null)
        log(msg);
}

function keyUp(e) {
    var k = keyMap[e.code];
    if (k === undefined)
        return;
    cpu.keyUp(k);
}

function log(text) {
    var plog = document.getElementById("log");
    plog.appendChild(document.createTextNode(text));
    plog.appendChild(document.createElement("br"));
    while (plog.childNodes.length > 100)
        plog.removeChild(plog.firstChild);
}

function debug(t) {
    var debug = document.getElementById("debug");
    debug.innerHTML += t;
}

canvas = document.getElementById("output");
ctx = canvas.getContext("2d");

var romSelect = document.getElementById("rom-select");
var i;
for (i = 0; i < ROMS.length; i++) {
    var opt = document.createElement("option");
    opt.value = ROMS[i];
    opt.textContent = ROMS[i];
    romSelect.appendChild(opt);
}
romSelect.value = DEFAULT_ROM;
romSelect.addEventListener("change", function () {
    loadRom(romSelect.value);
});

var speedSelect = document.getElementById("speed-select");
for (i = 0; i < SPEEDS.length; i++) {
    var sOpt = document.createElement("option");
    sOpt.value = SPEEDS[i];
    sOpt.textContent = SPEEDS[i] + "x";
    speedSelect.appendChild(sOpt);
}
speedSelect.value = String(speed);
speedSelect.addEventListener("change", function () {
    speed = parseInt(speedSelect.value, 10);
    stepMs = baseStepMs / speed;
});

document.getElementById("btn-run").addEventListener("click", doRun);
document.getElementById("btn-pause").addEventListener("click", doPause);
document.getElementById("btn-step").addEventListener("click", doStep);
document.getElementById("btn-reset").addEventListener("click", doReset);
document.addEventListener("keydown", keyDown);
document.addEventListener("keyup", keyUp);
lastTime = performance.now();
updateButtons();
loadRom(DEFAULT_ROM);
requestAnimationFrame(frame);
