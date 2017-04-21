const child_process = require('child_process');
const path = require('path');
const Task = require('../async/Task');

var BackendProcess = function(){
    this.pyProc = null;


    this.isPacked = function (script){
        let filename = /^(.*)\.py$/.exec(script)[1];
        let packed = false

        console.log('[Meson] Check for any executables which name is ' + filename)

        if (process.platform === 'win32') {
          packed = require('fs').existsSync(filename + '.exe');
        } else {
          packed = require('fs').existsSync(filename);
        }

        return packed;
    };

    this.spawn = function (root, backendDirectory, entryPoint, port) {
        var script = path.join(root, backendDirectory, entryPoint);

        var readyTask = new Task();

        if (!this.isPacked(script)) {
            console.log('[Meson] Launching script ' + script);
            this.pyProc = child_process.spawn('python', [script, port], {detached: false});
        } else {
            let filename = /^(.*)\.py$/.exec(script)[1];
            console.log('[Meson] Executing ' + filename);
            if (process.platform === 'win32') {
              this.pyProc = child_process.execFile(filename + '.exe', [port]);
          } else {
              this.pyProc = child_process.execFile(filename, [port]);
          }
        }

        this.pyProc.stdout.on('data', (data) => {
            if (String(data).includes("0x4D454F57")) {
                console.log('[Meson] Received ready signal from backend!');
                readyTask.done();
            }
        });

        this.pyProc.on('close', function (code) {
            console.warn('[Meson] Child process had closed.')
        })

        if (this.pyProc === null) {
          throw '[Meson] Cannot spawn backend process !';
        } else {
          console.log('[Meson] Backend process spawned, PID: ' + this.pyProc.pid);
          console.log('[Meson] Waiting for backend\'s ready signal...');
        }

        return readyTask.promise;
    };

    this.kill = function () {
        if (this.pyProc !== null) {
            this.pyProc.kill();
            this.pyProc = null;
        }
    };
};

module.exports = BackendProcess;
