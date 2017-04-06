var FrontendApplication = require('./Application').FrontendApplication
var BackendProcess = require('./Backend/Process')
var co = require('co')

var LocalFrontendApplication = function () {
    this.frontendApplication = new FrontendApplication()
    this.backendProcess = new BackendProcess()

    this.start = function (root, backendDirectory, entryPoint, port) {
        return co.wrap(function*(self) {
            try{
                console.log('Check if backend process is already running...')
                yield self.frontendApplication.start('localhost', port)
            } catch(error) {
                console.log('No backend process is running. Will spawn a new backend process...')
                yield self.backendProcess.spawn(root, backendDirectory, entryPoint, port)
                yield self.frontendApplication.start('localhost', port)
            }
            console.log('The backend is ready to be used.')
        })(this)
    }

    this.rpc_stub = function(method) {
        return this.frontendApplication.rpc_stub(method)
    }
    this.rpc = function (method, args) {
        return this.frontendApplication.rpc(method, args)
    }
    this.publish = function(topic, domain, payload){
        return this.frontendApplication.publish(topic, domain, payload)
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
