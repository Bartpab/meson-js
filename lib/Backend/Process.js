const child_process = require('child_process')
const path = require('path')
const Task = require('../async/Task')

var BackendProcess = function(){
    this.pyProc = null

    this.spawn = function (root, backendDirectory, entryPoint, port) {
        var script = path.join(root, backendDirectory, entryPoint)

        var readyTask = new Task()

        this.pyProc = child_process.spawn('python', [script, port])

        this.pyProc.stdout.on('data', (data) => {
            console.log("Backend :: OUT :: " + data)
            if (data == "0x4D454F57") {
                console.log('Received ready signal from backend!')
                readyTask.done()
            }
        })
        this.pyProc.stderr.on('data', (data) => {
          console.log("Backend :: ERR :: " + data)
        })

        this.pyProc.on('error', (error) => {
            console.error(error)
        })

        if (this.pyProc === null) {
          throw 'Cannot spawn backend process !'
        } else {
          console.log('Backend process spawned, PID: ' + this.pyProc.pid)
        }

        return readyTask.promise
    }

    this.kill = function () {
        if (this.pyProc !== null) {
            this.pyProc.kill()
            this.pyProc = null
        }
    }
}

module.exports = BackendProcess
