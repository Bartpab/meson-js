'use strict';

var IncomingHandler = require('./Incoming').IncomingHandler;
var OutcomingHandler = require('./Outcoming').OutcomingHandler;

var in_array = require('../utils/Array').in_array;
var has_key = require('../utils/Array').has_key;

/* IN Handlers */
var FrontendOperationReturnRouter = function(intercept) {
    var normalizedData = intercept.get();
    if (has_key(normalizedData, '__operation__') && normalizedData['__operation__'] === 'RPC' && has_key(normalizedData, '__return__') && has_key(normalizedData, '__ticket__')) {
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
    var normalizedData = intercept.get();
    
};
// OUT to the backend
var OperationNormalizer = function(intercept) {
    var operation = intercept.get();
    var normalizedOperation = {
        '__ticket__': operation.ticket,
        '__operation__': operation.operation,
        '__payload__': operation.payload
    };
    intercept.set(normalizedOperation);
};

var FrontendOperationRouter = function (duplex) {
    this.incomingReturn = new IncomingHandler(duplex.incoming, FrontendOperationReturnRouter);
    this.incomingPush = new IncomingHandler(duplex.incoming, FrontendPushOperationRouter);
    this.outcoming = new OutcomingHandler(duplex.outcoming, OperationNormalizer);
};

module.exports.Frontend = FrontendOperationRouter;
