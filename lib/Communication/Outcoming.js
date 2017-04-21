'use strict';

var Intercept = require('./Common').Intercept;
var coroutine = require('../async/Coroutine');

var PipelineMessageTask = function (message) {
    this.message = message;
    this.change = function (newMsg) {
        this.message = newMsg;
    };

    this.done = null;
    this.cancel = null;

    this.wait_for = new Promise(function(resolve, reject) {
        this.done = resolve;
        this.cancel = reject;
    }.bind(this));
};

var OutcomingHandler = function(parent, intercept, onTaskReceived) {
    this.parent = parent;
    this.intercept = intercept;
    this.onTaskReceived = onTaskReceived;

    this.push = function (sendMsg) {
        let task = new PipelineMessageTask(sendMsg);
        this.produce.next(task);
        return task;
    };

    var produceGenerator = function*(self) {
        while (true) {
            let task= yield;
            let intercept = new Intercept(task.message);

            if (self.onTaskReceived != null && self.onTaskReceived !== undefined) {
                self.onTaskReceived(task);
            }
            if (self.intercept != null) {
                try{
                    self.intercept(intercept);
                }
                catch(e){
                    console.log(e.stack);
                }
            }

            task.change(intercept.get());

            if (!intercept._stop && (self.parent !== undefined && self.parent !== null)) {
                self.parent.produce.next(task);
            }
        }
    };

    this.produce = coroutine(produceGenerator, [this]);
};

var OutcomingPipeline = function (pipeline) {
    this.pipeline = pipeline;

    this.root = new OutcomingHandler(null, null, function (task) {
        this.pipeline.send(task);
    }.bind(this));
};

module.exports.OutcomingHandler = OutcomingHandler;
module.exports.OutcomingPipeline = OutcomingPipeline;
