'use strict';

var co = require('co');
var coroutine = require('./async/Coroutine');
var WebSocketClient = require('ws');

var IncomingHandler = require('./Communication/Incoming').IncomingHandler;
var CommunicationPipeline = require('./Communication/Pipeline');
var ProtocolHandler = require('./Communication/Protocol').JSONProtocolHandler;
var SecureLayer = require('./Communication/Security').SecureLayer;
var FrontendOperationRouter = require('./Communication/OperationRouter').Frontend;

var Future = require('./async/Future');

const uuid4 = require('uuid/v4');
/* FrontendKernel */
var FrontendKernel = function () {};

var BackendError = function(name, message) {
    this.name = name;
    this.message = message;
    this.stack = (new Error()).stack;
};
BackendError.prototype = Object.create(Error.prototype);
BackendError.prototype.constructor = BackendError;

/* FrontendFrontalController */
var FrontendFrontalController = function (frontendKernel, operationRouter){
    this.operationRouter = operationRouter;
    this.operationResultFutures = {};

    this.onReturn = function(return_message) {
        var ticket = return_message.ticket;
        var operation = return_message.operation;
        var return_value = return_message.return_value;
        var error = return_message.error;

        var operationResultFuture = this.operationResultFutures[ticket];

        if (operationResultFuture !== undefined) {
            if (error !== null) {
                operationResultFuture.throw(new BackendError(error.name, error.message));
            } else {
                operationResultFuture.set_result(return_value);
            }
        }
    };

    // Exit the Frontal Controller, this will trigger cancel on all unresolved futures
    this.exit = function (reason) {
        for(var future in this.operationResultFutures) {
            if (reason === undefined) {
                reason = '[Meson] Exiting frontal controller.';
            }
            future.cancel(reason);
        }
        this.operationResultFutures = {};
    };

    this.executeInstruction = function (operation, payload) {
        var msg = {};

        msg.operation = operation;
        msg.ticket = uuid4();
        msg.payload = payload;

        var future = new Future();

        // Store the result future
        this.operationResultFutures[msg.ticket] = future;
        this.operationRouter.outcoming.push(msg);

        // PUBSUB don't wait for return
        if (operation === 'PUBSUB') {
            return Promise.resolve();
        }

        return future.promise;
    };

    this.onPush = function(push_message) {};

    this.consumeReturn = coroutine(function* (self) {
        while (true) {
            var return_message = yield;
            self.onReturn(return_message);
        }
    }, [this]);

    this.consumePush = coroutine(function* (self) {
        while (true) {
            var push_message = yield;
            self.onPush(push_message);
        }
    }, [this]);

    new IncomingHandler(operationRouter.incomingReturn, function (intercept) {
        this.consumeReturn.next(intercept.get());
    }.bind(this));

    new IncomingHandler(operationRouter.incomingPush, function (intercept) {
        this.consumePush.next(intercept.get());
    }.bind(this));
};

var FrontendApplication = function (app_id, server_secret, client_secret) {
    this.server_secret = server_secret;
    this.client_secret = client_secret;
    this.app_id        = app_id;

    this.STATUS_UNSTARTED = 0;
    this.STATUS_STARTED = 1;
    this.STATUS_RUNNING = 2;
    this.STATUS_CLOSING = 3;
    this.STATUS_CLOSED = 4;

    this.status = this.STATUS_UNSTARTED;

    this.pipeline = null;

    this.isStarted = function () {
        return this.STATUS_STARTED === this.status;
    };
    this.isRunning = function () {
        return this.STATUS_RUNNING === this.status;
    };
    this.isClosing = function () {
        return this.STATUS_CLOSING === this.status;
    };
    this.isClosed = function () {
        return this.STATUS_CLOSED === this.status;
    };

    this.exit = function (reason) {
        if (reason === undefined) {
            reason = '[Meson] Exiting application...';
        }

        this.status = this.STATUS_CLOSING;
        console.log('[Meson] Closing frontend application, reason: ' + reason);
        // Close the pipeline
        this.pipeline.close(reason);
        // Cancel all pending instructions
        this.frontalController.exit(reason);
        //
        this.status = this.STATUS_CLOSED;
    };

    this.connect = function (ws) {
        return new Promise(function (resolve, reject) {
            ws.onopen = function () {
                console.log('[Meson] Connection opened!');
                resolve(ws);
            };
            ws.onerror = function (error) {
                console.log('[Meson] Connection failed');
                reject('Connection failed');
            };
        });
    };

    this.buildPipeline = function (websocket) {
        return co.wrap(function* (self) {
            console.log('[Meson] Building communication pipeline...');
            self.pipeline = new CommunicationPipeline(websocket, self.app_id, self.server_secret, self.client_secret);
            yield self.pipeline.bind();
            self.pipeline.on('close', function(reason) {
                this.exit(reason);
            });
            console.log('[Meson] Communication pipeline is now bound with the websocket.');
            return self.pipeline;
        })(this);
    };

    this.bindSecureLayer = function (pipeline) {
      let sessionKey = pipeline.sessionKey;
      let sessionIV  = pipeline.sessionIV;
      this.secureLayer = new SecureLayer(sessionKey, sessionIV, pipeline);
      return this.secureLayer;
    };

    this.bindProtocolLayer = function(layer) {
        this.protocolHandler = new ProtocolHandler(layer);
        return this.protocolHandler;
    };

    this.bindOperationRouter = function(layer) {
        this.operationRouter = new FrontendOperationRouter(layer);
        return this.operationRouter;
    };

    this.buildKernel = function() {
        this.kernel = new FrontendKernel();
        return this.kernel;
    };

    this.buildFrontalController = function(kernel, operationRouter) {
        this.frontalController = new FrontendFrontalController(kernel, operationRouter);
        return this.frontalController;
    };

    this.rpc_stub = function(method) {
        return function () {
            var args = Array.prototype.slice.call(arguments, 0);
            return this.rpc(method, args);
        }.bind(this);
    };

    this.publish = function (topic, domain, payload) {
        var pubPayload = {
            'type': 'publish'
        };

        if (domain !== undefined) {
            pubPayload.domain = domain;
        }
        if (payload !== undefined) {
            pubPayload.payload = payload;
        }

        return this.frontalController.executeInstruction('PUBSUB', pubPayload);
    };
    this.rpc = function (method, args) {
        if (!this.isRunning()) {
            throw new Error('The backend is not available !');
        }

        return this.frontalController.executeInstruction('RPC', {
            'method': method,
            'args': args
        });
    };

    this.run = function() {
        return co.wrap(function*(self){
            if (!self.isStarted()) {
                console.error('[Meson] Trying to run application before calling start()');
                throw Error('Application had not been properly started.');
            }
            self.status = self.STATUS_RUNNING;
            try {
                while (self.isRunning()) {
                    yield self.pipeline.step();
                }
            } catch(error){
                console.error(error);
                throw error;
            } finally {
                self.exit();
            }
        })(this);
    };

    this.waitForStarted = new Promise(function (resolve) {
        this.started = resolve;
    }.bind(this));

    this.waitUntilStarted = function () {
      return this.waitForStarted;
    };

    this.start = function (addr, port) {
        let uri = 'ws://' + addr + ':' + port;
        console.log('[Meson] Connection to backend on ' + uri);
        let ws = new WebSocketClient(uri); // Max frame size  20 Mo
        return co.wrap(function* (frontend, websocket) {
            yield frontend.connect(websocket);
            // Channel communication
            let pipeline = yield frontend.buildPipeline(websocket);
            let security  = frontend.bindSecureLayer(pipeline);
            let protocol = frontend.bindProtocolLayer(security);
            let operationRouter = frontend.bindOperationRouter(protocol);
            // Frontend Kernel
            let kernel = frontend.buildKernel();
            // Frontend Frontal Controller
            let frontal = frontend.buildFrontalController(kernel, operationRouter);
            // Set the started status
            frontend.status = frontend.STATUS_STARTED;
            frontend.started();
        })(this, ws);
    };
};

module.exports.FrontendApplication = FrontendApplication;
