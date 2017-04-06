'use strict'

var co = require('co')
var coroutine = require('./async/Coroutine')
var WebSocketClient = require('websocket').w3cwebsocket

var IncomingHandler = require('./Communication/Incoming').IncomingHandler
var CommunicationPipeline = require('./Communication/Pipeline')
var ProtocolHandler = require('./Communication/Protocol').JSONProtocolHandler
var FrontendOperationRouter = require('./Communication/OperationRouter').Frontend

var Future = require('./async/Future')

const uuid4 = require('uuid/v4')
/* FrontendKernel */
var FrontendKernel = function () {

}
/* FrontendFrontalController */
var FrontendFrontalController = function (frontendKernel, operationRouter){
    this.operationRouter = operationRouter
    this.operationResultFutures = {}

    this.onReturn = function(return_message) {
        var ticket = return_message.ticket
        var operation = return_message.operation
        var return_value = return_message.return_value
        var error = return_message.error

        var operationResultFuture = this.operationResultFutures[ticket]

        if (operationResultFuture !== undefined) {
            if (error !== null && error !== 'None') {
                operationResultFuture.throw(error)
            } else {
                operationResultFuture.set_result(return_value)
            }
        }
    }

    // Exit the Frontal Controller, this will trigger cancel on all unresolved futures
    this.exit = function (reason) {
        for(var future in this.operationResultFutures) {
            if (reason === undefined) {
                reason = 'Exiting frontal controller.'
            }
            future.cancel(reason)
        }
        this.operationResultFutures = {}
    }

    this.executeInstruction = function (operation, payload) {
        var msg = {}

        msg.operation = operation
        msg.ticket = uuid4()
        msg.payload = payload

        var future = new Future()

        // Store the result future
        this.operationResultFutures[msg.ticket] = future
        this.operationRouter.outcoming.push(msg)

        // PUBSUB don't wait for return
        if (operation === 'PUBSUB') {
            return Promise.resolve()
        }

        return future.promise
    }

    this.onPush = function(push_message) {}

    this.consumeReturn = coroutine(function* (self) {
        while (true) {
            var return_message = yield
            self.onReturn(return_message)
        }
    }, [this])

    this.consumePush = coroutine(function* (self) {
        while (true) {
            var push_message = yield
            self.onPush(push_message)
        }
    }, [this])

    new IncomingHandler(operationRouter.incomingReturn, function (intercept) {
        this.consumeReturn.next(intercept.get())
    }.bind(this))

    new IncomingHandler(operationRouter.incomingPush, function (intercept) {
        this.consumePush.next(intercept.get())
    }.bind(this))
}

var FrontendApplication = function () {
    this.STATUS_UNSTARTED = 0
    this.STATUS_STARTED = 1
    this.STATUS_RUNNING = 2
    this.STATUS_CLOSING = 3
    this.STATUS_CLOSED = 4

    this.status = this.STATUS_UNSTARTED

    this.pipeline = null

    this.isStarted = function () {
        return this.STATUS_STARTED === this.status
    }
    this.isRunning = function () {
        return this.STATUS_RUNNING === this.status
    }
    this.isClosing = function () {
        return this.STATUS_CLOSING === this.status
    }
    this.isClosed = function () {
        return this.STATUS_CLOSED === this.status
    }

    this.exit = function (reason) {
        if (reason === undefined) {
            reason = 'Exiting application...'
        }

        this.status = this.STATUS_CLOSING
        console.log('Closing frontend application, reason: ' + reason)
        // Close the pipeline
        this.pipeline.close(reason)
        // Cancel all pending instructions
        this.frontalController.exit(reason)
        //
        this.status = this.STATUS_CLOSED
    }

    this.connect = function (ws) {
        return new Promise(function (resolve, reject) {
            ws.onopen = function () {
                console.log('Connection opened!')
                resolve(ws)
            }
            ws.onerror = function (error) {
                console.log('Connection failed')
                reject('Connection failed')
            }
        })
    }

    this.buildPipeline = function (websocket) {
        return co.wrap(function* (self) {
            self.pipeline = new CommunicationPipeline(websocket)
            yield self.pipeline.bind()

            self.pipeline.on('close', function(reason) {
                this.exit(reason)
            })

            return self.pipeline
        })(this)
    }

    this.bindProtocol = function(pipeline) {
        this.protocolHandler = new ProtocolHandler(pipeline)
        return this.protocolHandler
    }

    this.bindOperationRouter = function(protocol) {
        this.operationRouter = new FrontendOperationRouter(protocol)
        return this.operationRouter
    }

    this.buildKernel = function() {
        this.kernel = new FrontendKernel()
        return this.kernel
    }

    this.buildFrontalController = function(kernel, operationRouter) {
        this.frontalController = new FrontendFrontalController(kernel, operationRouter)
        return this.frontalController
    }

    this.rpc_stub = function(method) {
        return function () {
            var args = Array.prototype.slice.call(arguments, 0)
            return this.rpc(method, args)
        }.bind(this)
    }

    this.publish = function (topic, domain, payload) {
        var pubPayload = {
            'type': 'publish'
        }

        if (domain !== undefined) {
            pubPayload.domain = domain
        }
        if (payload !== undefined) {
            pubPayload.payload = payload
        }

        return this.frontalController.executeInstruction('PUBSUB', pubPayload)
    }
    this.rpc = function (method, args) {
        return this.frontalController.executeInstruction('RPC', {
            'method': method,
            'args': args
        })
    }

    this.run = function() {
        return co.wrap(function*(self){
            if (!self.isStarted()) {
                console.error('Trying to run application before calling start()')
                throw Error('Application had not been properly started.')
            }
            self.status = self.STATUS_RUNNING
            try {
                while (self.isRunning()) {
                    yield self.pipeline.step()
                }
            } catch(error){
                console.error(error)
                throw error
            } finally {
                self.exit()
            }
        })(this)
    }

    this.start = function (addr, port) {
        let uri = 'ws://' + addr + ':' + port
        console.log('Connection to backend on ' + uri)

        let ws = new WebSocketClient(uri)

        return co.wrap(function* (frontend, websocket) {
            yield frontend.connect(websocket)
            // Channel communication
            let pipeline = yield frontend.buildPipeline(websocket)
            let protocol = frontend.bindProtocol(pipeline)
            let operationRouter = frontend.bindOperationRouter(protocol)
            // Frontend Kernel
            let kernel = frontend.buildKernel()
            // Frontend Frontal Controller
            let frontal = frontend.buildFrontalController(kernel, operationRouter)
            // Set the started status
            frontend.status = frontend.STATUS_STARTED
        })(this, ws)
    }
}

module.exports.FrontendApplication = FrontendApplication
