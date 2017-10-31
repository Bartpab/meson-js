var IncomingHandler = require('./Incoming').IncomingHandler;
var OutcomingHandler = require('./Outcoming').OutcomingHandler;
var crypto = require('crypto');

var IncomingSecuredRouter = function (intercept) {
    try {
        intercept.set(JSON.parse(intercept.get()));
    } catch (e) {
        intercept.stop();
    }
};

var OutcomingSecuredRouter = function (intercept) {
    try {
        intercept.set(JSON.stringify(intercept.get()));
    } catch (e) {
        intercept.stop();
    }
};

var SecureLayer = function (sessionKey, sessionIV, layer) {
    function decrypt (intercept) {
      let cipher = crypto.createDecipheriv('aes-256-cbc', sessionKey, sessionIV);
      var decryptedData = cipher.update(intercept.get(), 'utf8', 'hex') + cipher.final('hex');
      return decryptedData;
    }

    function encrypt (intercept) {
      let cipher = crypto.createCipheriv('aes-256-cbc', sessionKey, sessionIV);
      var decryptedData = cipher.update(intercept.get(), 'utf8', 'hex') + cipher.final('hex');
      return decryptedData;
    }

    this.incoming     = new IncomingHandler(layer.incoming, decrypt);
    this.outcoming    = new OutcomingHandler(layer.outcoming, encrypt);
};

module.exports.SecureLayer = SecureLayer;
