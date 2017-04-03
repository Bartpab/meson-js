var FrontendApplication = require('./Application').FrontendApplication
var BackendProcess = require('./Backend/Process')
var co = require('co')

var LocalFrontendApplication = function () {
    this.frontendApplication = new FrontendApplication()
    this.backendProcess = new BackendProcess()

    this.start = function (root, backendDirectory, entryPoint, port) {
        return co.wrap(function*(self) {
            yield self.backendProcess.spawn(root, backendDirectory, entryPoint, port)
            yield self.frontendApplication.start('localhost', port)
        })(this)
    }

    this.run = function () {
        return this.frontendApplication.run()
    }

    this.exit = function () {
        this.frontendApplication.exit()
        this.backendProcess.kill()
    }
}

module.exports.FrontendApplication = FrontendApplication
module.exports.LocalFrontendApplication = LocalFrontendApplication
