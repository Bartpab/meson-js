'use strict';
var co = require('co')

var PromiseStatusAwareness = require('../utils/Promise').PromiseStatusAwareness
var AsyncQueue = require('../async/Queue')
var IncomingPipeline = require('./Incoming').IncomingPipeline
var OutcomingPipeline = require('./Outcoming').OutcomingPipeline

var CommunicationPipeline = function (websocket) {
    this.recvQueue = new AsyncQueue()
    this.sendQueue = new AsyncQueue()

    this.consumeStatus = null
    this.consumePromise = null
    this.produceStatus = null
    this.producePromise = null

    this.recvCoroutines = []

    this.breakTrigger = new Promise(function(resolve, reject) {
        this.break = resolve
    }.bind(this))
    this.breakTriggerStatus = new PromiseStatusAwareness(this.breakTrigger)

    websocket.onmessage = function (message) {
        this.recvQueue.put(message.data)
    }.bind(this)

    this.recv = function () {
        return this.recvQueue.get()
    }
    this.send = function (sendTask) {
        this.sendQueue.put(sendTask)
    }

    this.consume = function* (self) {
        let recv = yield self.recvQueue.get()

        for (var co of self.recvCoroutines) {
            co.next(recv)
        }

        return 'consumed'
    }

    this.produce = function* (self) {
        let sendTask = yield self.sendQueue.get()
        let sendMsg = sendTask.message
        websocket.send(sendMsg)
        sendTask.done()
        return 'produced'
    }

    this.step = function () {
        // Reload the break trigger
        if (this.breakTriggerStatus.isFinished) {
            this.breakTrigger = new Promise(function(resolve, reject) {
                this.break = resolve
            }.bind(this))
            this.breakTriggerStatus = new PromiseStatusAwareness(this.breakTrigger)
        }
        if (this.consumeStatus === null || this.consumeStatus.isFinished) {
            this.consumePromise = co.wrap(this.consume)(this)
            this.consumeStatus = new PromiseStatusAwareness(this.consumePromise)
        }
        if (this.produceStatus === null || this.produceStatus.isFinished) {
            this.producePromise = co.wrap(this.produce)(this)
            this.produceStatus = new PromiseStatusAwareness(this.producePromise)
        }

        return Promise.race([this.consumePromise, this.producePromise, this.breakTrigger])
    }
    this.bind = function () {
        return co.wrap(function* (pipeline) {
            let recv = yield pipeline.recv()

            if (recv === 'handshake') {
                websocket.send('json')
            } else {
                throw 'Handshake wrong.'
            }

            pipeline.incoming = new IncomingPipeline(pipeline)
            pipeline.outcoming = new OutcomingPipeline(pipeline)

            return pipeline
        })(this)
    }
}

module.exports = CommunicationPipeline
