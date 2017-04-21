var Intercept = require('./Common').Intercept;
var coroutine = require('../async/Coroutine');

var IncomingHandler = function (parent, intercept) {
    this.children = [];
    this.intercept = intercept;

    // Consume coroutine
    this.consume = coroutine(function*(self) {
        while (true){
            var incoming = yield;
            var intercept = new Intercept(incoming);
            try{
                self.intercept(intercept);
                if (!intercept._stop) {
                    for (var child of self.children) {
                        child.consume.next(intercept.get());
                    }
                }
            } catch(e) {
                console.log(e.stack);
            }
        }
    }, [this]);

    if (parent !== undefined && parent !== null) {
        parent.children.push(this);
    }
};

var IncomingPipeline = function (pipeline) {
    this.pipeline = pipeline;
    this.root = new IncomingHandler(null, (intercept) => {});

    this.co = coroutine(function*(self){
        while (true) {
            var recv = yield;
            self.root.consume.next(recv);
        }
    }, [this]);

    this.pipeline.recvCoroutines.push(this.co);
};

module.exports.IncomingPipeline = IncomingPipeline;
module.exports.IncomingHandler = IncomingHandler;
