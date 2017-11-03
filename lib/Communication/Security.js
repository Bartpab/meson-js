var IncomingHandler = require('./Incoming').IncomingHandler;
var OutcomingHandler = require('./Outcoming').OutcomingHandler;
var crypto = require('crypto');

var SecureLayer = function (sessionKey, sessionIV, layer) {
    var decrypt = function (intercept) {
      var decipher = crypto.createDecipheriv('aes-256-cbc', sessionKey, sessionIV);
      var hexStr = intercept.get();
      var buffer = Buffer.from(hexStr, 'hex');
      var decoded = Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf-8');
      intercept.set(decoded);
    };

    var encrypt = function (intercept) {
      var cipher = crypto.createCipheriv('aes-256-cbc', sessionKey, sessionIV);
      var encryptedData = cipher.update(intercept.get(), 'utf8', 'hex') + cipher.final('hex');
      intercept.set(encryptedData);
    };

    this.incoming     = new IncomingHandler(layer.incoming, decrypt);
    this.outcoming    = new OutcomingHandler(layer.outcoming, encrypt);
};

module.exports.SecureLayer = SecureLayer;
