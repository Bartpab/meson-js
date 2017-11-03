var FrontendApplication = require('./Application').FrontendApplication;
var BackendProcess = require('./Backend/Process');
var co = require('co');

var LocalFrontendApplication = function (app_id, server_secret, client_secret) {
    this.frontendApplication  = new FrontendApplication(app_id, server_secret, client_secret);
    this.backendProcess       = new BackendProcess();

    this.start = function (root, backendDirectory, entryPoint, port, spawnNew=false) {
        return co.wrap(function*(self) {
            if (spawnNew === true){
              console.log('[Meson] Will spawn a new backend process...');
              var newPort = yield self.backendProcess.spawn(root, backendDirectory, entryPoint, port);
              yield self.frontendApplication.start('127.0.0.1', newPort);
            } else {
              try{
                  console.log('[Meson] Check if backend process is already running...');
                  yield self.frontendApplication.start('127.0.0.1', port);
              } catch(error) {
                  console.log('[Meson] No backend process is running. Will spawn a new backend process...');
                  var newPort = yield self.backendProcess.spawn(root, backendDirectory, entryPoint, port);
                  yield self.frontendApplication.start('127.0.0.1', newPort);
              }
            }
            console.log('[Meson] The backend is ready to be used.');
        })(this);
    };

    this.rpc_stub = function (method) {
        return this.frontendApplication.rpc_stub(method);
    };
    this.rpc = function (method, args) {
        return this.frontendApplication.rpc(method, args);
    };
    this.publish = function (topic, domain, payload) {
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
    this.waitUntilExiting = function () {
      return this.frontendApplication.waitUntilExiting();
    };

    this.getID = function () {
      return this.frontendApplication.getID();
    };
};

module.exports.FrontendApplication = FrontendApplication;
module.exports.LocalFrontendApplication = LocalFrontendApplication;
