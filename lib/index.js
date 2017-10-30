var FrontendApplication = require('./Application').FrontendApplication;
var BackendProcess = require('./Backend/Process');
var co = require('co');

var LocalFrontendApplication = function (server_secret, client_secret) {
    this.frontendApplication  = new FrontendApplication(server_secret, client_secret);
    this.backendProcess       = new BackendProcess();

    this.start = function (root, backendDirectory, entryPoint, port) {
        return co.wrap(function*(self) {
            try{
                console.log('[Meson] Check if backend process is already running...');
                yield self.frontendApplication.start('127.0.0.1', port);
            } catch(error) {
                console.log('[Meson] No backend process is running. Will spawn a new backend process...');
                let newPort = yield self.backendProcess.spawn(root, backendDirectory, entryPoint, port);
                yield self.frontendApplication.start('127.0.0.1', newPort);
            }
            console.log('[Meson] The backend is ready to be used.');
        })(this);
    };

    this.rpc_stub = function(method) {
        return this.frontendApplication.rpc_stub(method);
    };
    this.rpc = function (method, args) {
        return this.frontendApplication.rpc(method, args);
    };
    this.publish = function(topic, domain, payload){
        return this.frontendApplication.publish(topic, domain, payload);
    };
    this.run = function () {
        return this.frontendApplication.run();
    };

    this.exit = function () {
        this.frontendApplication.exit();
        this.backendProcess.kill();
    };
    this.waitUntilStarted = function () {
        return this.frontendApplication.waitUntilStarted();
    };
};

module.exports.FrontendApplication = FrontendApplication;
module.exports.LocalFrontendApplication = LocalFrontendApplication;
