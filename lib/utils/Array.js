var has_key = function(obj, key) {
    return obj[key] !== undefined
}
var in_array = function(array, value) {
    console.log(array)
    return array.indexOf(value) !== -1
}

module.exports.in_array = in_array
module.exports.has_key = has_key
