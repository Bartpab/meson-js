var IncomingHandler = require('./Incoming').IncomingHandler;
var OutcomingHandler = require('./Outcoming').OutcomingHandler;

var IncomingJSONRouter = function (intercept) {
    try {
        intercept.set(JSON.parse(intercept.get()));
    } catch (e) {
        intercept.stop();
    }
};

var OutcomingJSONRouter = function (intercept) {
    try {
        intercept.set(JSON.stringify(intercept.get()));
    } catch (e) {
        intercept.stop();
    }
};

var JSONProtocolHandler = function (duplex) {
    this.incoming     = new IncomingHandler(duplex.incoming, IncomingJSONRouter);
    this.outcoming    = new OutcomingHandler(duplex.outcoming, OutcomingJSONRouter);
};

module.exports.JSONProtocolHandler = JSONProtocolHandler;
