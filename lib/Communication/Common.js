var Intercept = function (value) {
    this._stop = false;
    this._value = value;

    this.stop = function () {
        this.stop = true;
    };
    this.get = function () {
        return this._value;
    };
    this.set = function (newValue) {
        this._value = newValue;
    };
};

module.exports.Intercept = Intercept;
