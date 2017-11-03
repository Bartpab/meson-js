const child_process = require('child_process');
const path = require('path');
const Task = require('../async/Task');
const readline = require('readline');
const util = require("util");
const fs = require('fs');
var BackendProcess = function(){
    this.pyProc = null;


    this.isPacked = function (script){
        var filename = /^(.*)\.py$/.exec(script)[1];
        var packed = false;

        console.log('[Meson] Check for any executables which name is ' + filename);

        if (process.platform === 'win32') {
          packed = require('fs').existsSync(filename + '.exe');
        } else {
          packed = require('fs').existsSync(filename);
        }

        return packed;
    };

    this.spawn = function (root, backendDirectory, entryPoint, port) {
        var script = path.join(root, backendDirectory, entryPoint);
        var exe_script = path.join(root, '..', '..', backendDirectory, entryPoint);
        var readyTask = new Task();

        if (this.isPacked(exe_script) === true) {
            var filename = /^(.*)\.py$/.exec(exe_script)[1];
            console.log('[Meson] Executing ' + filename);
            if (process.platform === 'win32') {
              this.pyProc = child_process.execFile(filename + '.exe', [port]);
          } else {
              this.pyProc = child_process.execFile(filename, [port]);
          }
        } else {
            try {
              console.log('[Meson] Launching script ' + script);
              if (fs.existsSync(script)) {
                this.pyProc = child_process.spawn('python', [script], {detached: false});
              }
            } catch(e) {
              console.log(e);
              readyTask.reject(e);
            }
        }

        this.pyProc.stdout.on('data', (data) => {
          data = data.toString('utf8');// buffer to string
          re = /SERVING .* ON .*:([0-9]{1,5})/g;
          console.log(data);
          if (String(data).search(re) >= 0) {
              var m = re.exec(data);
              var port = m[1];
              console.log('[Meson] Received ready signal from backend! Connecting on port ' + port);
              readyTask.done(port);
          }
        });

        this.pyProc.on('close', function (code) {
            console.warn('[Meson] Child process had closed, code=' + code);
        });

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
