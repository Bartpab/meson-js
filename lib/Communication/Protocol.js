var IncomingHandler = require('./Incoming').IncomingHandler
var OutcomingHandler = require('./Outcoming').OutcomingHandler

var IncomingJSONRouter = function (intercept) {
    try {
        intercept.set(JSON.parse(intercept.get()))
    } catch (e) {
        intercept.stop()
    }
}

var OutcomingJSONRouter = function (intercept) {
    try {
        intercept.set(JSON.stringify(intercept.get()))
    } catch (e) {
        intercept.stop()
    }
}

var JSONProtocolHandler = function (pipeline) {
    this.incoming     = new IncomingHandler(pipeline.incoming.root, IncomingJSONRouter)
    this.outcoming    = new OutcomingHandler(pipeline.outcoming.root, OutcomingJSONRouter)
}

module.exports.JSONProtocolHandler = JSONProtocolHandler
