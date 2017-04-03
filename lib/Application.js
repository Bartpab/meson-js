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

    this.executeInstruction = function (operation, payload) {
        var msg = {}

        msg.operation = operation

        msg.ticket = uuid4()

        msg.payload = payload

        var future = new Future()

        // Store the result future
        this.operationResultFutures[msg.ticket] = future

        this.operationRouter.outcoming.push(msg)

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
    this.pipeline = null
    this._exit = false

    this.exit = function () {
        this._exit = true

        if (this.pipeline) {
            // Break the pipeline step yielding
            this.pipeline.break()
        }
    }

    this.connect = function (ws) {
        return new Promise(function (resolve, reject) {
            ws.onopen = function () {
                console.log('Connection opened!')
                resolve(ws)
            }
            ws.onerror = function (error) {
                console.log('Connection failed, reason: ' + error)
                reject('Connection failed')
            }
        })
    }

    this.buildPipeline = function (websocket) {
        return co.wrap(function* (self) {
            self.pipeline = new CommunicationPipeline(websocket)
            yield self.pipeline.bind()
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
    this.rpc = function (method, args) {
        return this.frontalController.executeInstruction('RPC', {
            'method': method,
            'args': args
        })
    }

    this.run = function() {
        return co.wrap(function*(self){
            while (!self._exit) {
                let done = yield self.pipeline.step()
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

        })(this, ws)
    }
}

module.exports.FrontendApplication = FrontendApplication
