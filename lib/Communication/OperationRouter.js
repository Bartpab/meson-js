'use strict';

var IncomingHandler = require('./Incoming').IncomingHandler;
var OutcomingHandler = require('./Outcoming').OutcomingHandler;

var in_array = require('../utils/Array').in_array;
var has_key = require('../utils/Array').has_key;
/* IN Handlers */
var FrontendOperationReturnRouter = function(intercept) {
    var normalizedData = intercept.get();
    if (has_key(normalizedData, '__operation__') && has_key(normalizedData, '__return__') && has_key(normalizedData, '__ticket__')) {
        var operationReturn = {
            ticket: normalizedData['__ticket__'],
            operation: normalizedData['__operation__'],
            return_value: normalizedData['__return__'],
            error: has_key(normalizedData, '__error__') ? normalizedData['__error__'] : null
        };
        intercept.set(operationReturn);
    } else {
        intercept.stop();
    }
};
// Push operations from the backend for the frontend, cache refreshing, etc.
var FrontendPushOperationRouter = function(intercept) {
    // Todo
};
// OUT
var OperationNormalizer = function(intercept) {
    var operation = intercept.get();
    var normalizedOperation = {
        '__ticket__': operation.ticket,
        '__operation__': operation.operation,
        '__payload__': operation.payload
    };
    intercept.set(normalizedOperation);
};

var FrontendOperationRouter = function (protocolHandler) {
    this.incomingReturn = new IncomingHandler(protocolHandler.incoming, FrontendOperationReturnRouter);
    this.incomingPush = new IncomingHandler(protocolHandler.incoming, FrontendPushOperationRouter);
    this.outcoming = new OutcomingHandler(protocolHandler.outcoming, OperationNormalizer);
};

module.exports.Frontend = FrontendOperationRouter;
