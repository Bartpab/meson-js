var FrontendApplication = require('./Application').FrontendApplication;
var BackendProcess = require('./Backend/Process');
var co = require('co');

var ConnectionHandler = require('./Communication/ConnectionHandler').ConnectionHandler;
var CoStrats = require('./Communication/ConnectionStrategies');


var LOCAL_HOST = '127.0.0.1';

class RPCService {

};

class LocalFrontendApplication {
    constructor (app_id, server_secret, client_secret) {
        this._app_id = app_id;
        this._server_secret = server_secret;
        this._client_secret = client_secret;
    
        this._backendProcess = null;
        this._socketHandler = null;
    
        this._startPromise = null
        this._backendSpawnPromise = null
        this._connectionRequestPromise = null
        this._sessionBuildPromise = null
        this._exitPromise = null
        
        this._connectionStrategy = new CoStrats.AggregatedConnectionStrategy();
    }
    getID () {
        return this._app_id;
    };

    getConnectionStrategy () {
        return this._connectionStrategy
    };

    start (root, backendDirectory, entryPoint, port, spawnNew=false) {
        return this.async_local_start(root, backendDirectory, entryPoint, port, spawnNew=false)
    };

    rpc_stub (method) {
        return this.frontendApplication.rpc_stub(method);
    };
    rpc (method, args) {
        return this.frontendApplication.rpc(method, args);
    };
    publish = function (topic, domain, payload) {
       throw 'Not implemented currently.';
    };

   exit () {
        if (this._socketHandler !== null) {
            this._socketHandler.close()
        }
        if (this._backendProcess !== null) {
            this._backendProcess.kill();
        }
    };

    waitUntilStarted () {
        return this._startPromise;
    };
    waitUntilExiting = function () {
        return this._exitPromise;
    };
    
    async_remote_start (host, port) {
        if (this._startPromise != null) {
            throw "The client is already starting.";
        } 
        
        this._startPromise = this.async_connect(host, port)

        return this._startPromise;
    };

    async_local_start (root, backendDirectory, entryPoint, port, spawnNew=false) {
        if (this._startPromise != null) {
            throw "The client is already starting.";
        }

        this._startPromise = co.wrap(function * (self) {
            if (spawnNew) {
                var assignedPort = yield self.async_spawn_process(root, backendDirectory, entryPoint, port);
                yield self.async_connect(LOCAL_HOST, assignedPort);
            } else {
                try {
                    yield self.async_connect(LOCAL_HOST, port);
                } catch (error) {
                    var assignedPort = yield self.async_spawn_process(root, backendDirectory, entryPoint, port);
                    yield self.async_connect(LOCAL_HOST, assignedPort);
                }
            }
        })(this);

        return this._startPromise;
    };

    async_spawn_process (root_dir, backend_dir, entry_point, port)
    {
        if (this._backendSpawnPromise != null) {
            throw "A backend process is currently spawning.";
        }

        console.log('[Meson] Will spawn a new backend process...');
        this._backendProcess = BackendProcess();
        this._backendSpawnPromise = this._backendProcess.spawn(root_dir, backend_dir, entry_point, port);
        
        this._backendSpawnPromise.then(function () {
            console.log('[Meson] Backend process spawned.');
        }).catch(function (error) {
            this._backendProcess = null
            console.log('[Meson] Failed to spawn process, error is ' + error + '.');
        })

        this._backendSpawnPromise.finally(function () {
            this._backendSpawnPromise = null
        });
        return this._backendSpawnPromise;
    };

    async_connect (host, port) {
        if (this._connectionRequestPromise != null) {
            throw "A connection request is currently running.";
        }

        var uri = 'ws://' + host + ':' + port;
        console.log('[Meson] Connection to backend on ' + uri);
        var ws = new WebSocketClient(uri); // Max frame size  20 Mo

        this._connectionRequestPromise =  new Promise(function (resolve, reject) {
            ws.onopen = function () {
                console.log('[Meson] Connection opened!');
                resolve(ws);
            };
            ws.onerror = function (error) {
                console.log('[Meson] Connection failed');
                reject('Connection failed, error is: ' + error);
            };
        })
        
        this._connectionRequestPromise.then(function () {
            this.async_build_session(ws);
        })

        connectPromise.finally(function () {
            this._connectionRequestPromise = null;
        })

        return this._connectionRequestPromise;
    };

    async_build_session (websocket) {
        if (this._sessionBuildPromise != null) {
            throw "Currently building a session.";
        }

        this._sessionBuildPromise = co.wrap(function* (self) {
            yield self.async_build_pipeline()
        })(this);

        this._sessionBuildPromise.finally(function () {
            this._sessionBuildPromise = null;
        });
    };
    
    async_build_pipeline (websocket) {
        return co.wrap (function * (self) {
            var connectionHandler = ConnectionHandler(websocket);
            var pipelineBuilder = PipelineBuilder(connectionHandler.getRootPipeline());
            var keepConnected = yield self.getConnectionStrategy().newConnection(connectionHandler, pipelineBuilder);
            if (keepConnected) {
                pipelineBuilder.build();
            } else {
                connectionHandler.close();
            }
        })(this);
    };

};

module.exports.LocalFrontendApplication = LocalFrontendApplication;
