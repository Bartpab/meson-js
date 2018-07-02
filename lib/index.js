var co = require('co');
var WebSocketClient = require('ws');

var BackendProcess = require('./Backend/Process');

var ConnectionHandler = require('./Communication/ConnectionHandler').ConnectionHandler;
var CoStrats = require('./Communication/CommunicationStrategies');

var FrontendRPCService = require('./Service/FrontendRPC').FrontendRPCService;
var PipelineBuilder = require('./Communication/Pipeline').PipelineBuilder;

var LOCAL_HOST = '127.0.0.1';

class LocalFrontendApplication {
    constructor (app_id, server_secret, client_secret) {
        this._app_id = app_id;
        this._server_secret = server_secret;
        this._client_secret = client_secret;
    
        this._backendProcess = null;
        this._connectionHandler = null;
    
        this._startPromise = null;
        this._backendSpawnPromise = null;
        this._connectionRequestPromise = null;
        this._sessionBuildPromise = null;
        
        this._exitPromise = null;
        this._exitPromise_resolve = null;
        this._exitPromise_reject = null;

        this._frontendRPCService = new FrontendRPCService();

        this._CommunicationStrategy = new CoStrats.AggregatedCommunicationStrategy();
        this._CommunicationStrategy.push(
            new CoStrats.SecuredFrontendCommunicationStrategy(this._app_id, this._server_secret, this._client_secret)
        ).push(
            new CoStrats.SerializerStrategy()
        ).push (
            new CoStrats.FrontendRPCCommunicationStrategy(this.getRPCService())
        );
    };

    getConnectionHandler() {
        return this._connectionHandler;
    };

    getRPCService() {
        return this._frontendRPCService;
    };

    getID () {
        return this._app_id;
    };

    getCommunicationStrategy () {
        return this._CommunicationStrategy;
    };

    exit () {
        if (this.getConnectionHandler() !== null && this.getConnectionHandler().isClosed() === false) {
            this.getConnectionHandler().close();
        }
        if (this._backendProcess !== null) {
            this._backendProcess.kill();
        }
    };
    
    start (root, backendDirectory, entryPoint, port, spawnNew=false) {
        console.log('[Meson] Starting meson binding');
        this._exitPromise = new Promise(function (resolve, reject) {
            this._exitPromise_resolve = resolve;
            this._exitPromise_reject = reject;
        }.bind(this));
        return this.async_local_start(
            root, 
            backendDirectory, 
            entryPoint, 
            port, 
            spawnNew
        );
    };

    rpc_stub (method, timeout) {
        return this.getRPCService().rpc_stub(method, timeout);
    };

    rpc (method, args, timeout) {
        return this.getRPCService().rpc(method, args), timeout;
    };

    publish (topic, domain, payload) {
       throw 'Not implemented currently.';
    };

    waitUntilStarted () {
        return this._startPromise;
    };

    waitUntilExiting() {
        return this._exitPromise;
    };
    
    async_remote_start (host, port) {
        if (this._startPromise != null) {
            throw "The client is already starting.";
        } 
        
        this._startPromise = this.async_connect(host, port);

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

        this._startPromise.catch(function (error) {
            this._exitPromise_resolve(error);
        }.bind(this));

        return this._startPromise;
    };

    async_spawn_process (root_dir, backend_dir, entry_point, port)
    {
        if (this._backendSpawnPromise != null) {
            throw "A backend process is currently spawning.";
        }

        console.log('[Meson] Will spawn a new backend process...');
        this._backendProcess = new BackendProcess();
        this._backendSpawnPromise = this._backendProcess.spawn(root_dir, backend_dir, entry_point, port);
        
        this._backendSpawnPromise.then(function () {
            console.log('[Meson] Backend process spawned.');
        }).catch(function (error) {
            this._backendProcess = null;
            console.log('[Meson] Failed to spawn process, error is ' + error + '.');
        });

        return this._backendSpawnPromise;
    };

    async_connect (host, port) {
        if (this._connectionRequestPromise !== null) {
            throw "A connection request is currently running.";
        }

        var uri = 'ws://' + host + ':' + port;
        console.log('[Meson] Connection to backend on ' + uri);
        var ws = new WebSocketClient(uri); // Max frame size  20 Mo

        var connectionPromise =  new Promise(function (resolve, reject) {
            ws.onopen = function () {
                console.log('[Meson] Connection opened!');
                resolve(ws);
            };
            ws.onerror = function (error) {
                console.log('[Meson] Connection failed');
                reject('Connection failed, error is: ' + error);
            };
        });
        
        this._connectionRequestPromise = co.wrap(function * () {
            try {
                var websocket = yield connectionPromise;
                yield this.async_build_session(websocket);
            } finally {
                this._connectionRequestPromise = null;
            }
        }.bind(this))();

        return this._connectionRequestPromise;
    };

    async_build_session (websocket) {
        if (this._sessionBuildPromise != null) {
            throw "Currently building a session.";
        }

        this._sessionBuildPromise = co.wrap(function* (self) {
            yield self.async_build_pipeline(websocket);
        })(this);
        return this._sessionBuildPromise;
    };

    onExit (reason) {
        console.log('Exitting because ' + reason);
        this._exitPromise_resolve(reason);
    };

    async_build_pipeline (websocket) {
        return co.wrap (function * (self, websocket) {
            var connectionHandler = new ConnectionHandler(websocket);
            connectionHandler.on('close', self.onExit);
            self._connectionHandler = connectionHandler;
            var pipelineBuilder = new PipelineBuilder(connectionHandler.getRootPipeline());
            var keepConnected = yield self.getCommunicationStrategy().newConnection(connectionHandler, pipelineBuilder);
            if (keepConnected) {
                pipelineBuilder.build();
                yield connectionHandler.recv(); // Wait for the OK signal
                connectionHandler.getRootPipeline().onReady(),
                console.log('[Meson] Received OK signal !');
            } else {
                connectionHandler.close();
            }
        })(this, websocket);
    };

};

module.exports.LocalFrontendApplication = LocalFrontendApplication;
