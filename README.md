# Meson Js

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> 
## Purpose
	Meson JS is a library to execute remote python logic through RPC calls
## Installation

```sh
npm install meson-js --save
To use with python package meson-py
```

## Usage

```js
var Meson = require('meson-js')
var backendApplication = new Meson.LocalFrontendApplication('[APP UID]', 'server_password', 'client_password')

async lifecycle (backendApplication){
	await backendApplication.start('/path/to/backend/dir', 'backend-entry.py', port, true)
	await backendApplication.run()
	await backendApplication.waitUntilExiting()
} 

async executeLogic (backendApplication, callback, fallback) {
	try {
		yield backendApplication.waitUntilStarted()
	} catch (error) {
		if(!!fallback) {
			fallback(error)
		}
		return
	}
	callback(backendApplication)
}


lifecycle(backendApplication).then(() => {
	clean()
	app.quit()
}).catch((error) => {
	log(error)
	clean_after_error()
	app.quit()
})

executeLogic(backendApplication, function (backendApplication) {
	let result = await backendApplication.rpc_stub('com.backend.rpc.add')(1, 2)
	print(result)
})


```

## License

MIT license

[npm-image]: https://img.shields.io/npm/v/meson-js.svg?style=flat
[npm-url]: https://npmjs.org/package/meson-js
[downloads-image]: https://img.shields.io/npm/dm/meson-js.svg?style=flat
[downloads-url]: https://npmjs.org/package/meson-js
[travis-image]: https://img.shields.io/travis/Bartpab/meson-js.svg?style=flat
[travis-url]: https://travis-ci.org/Bartpab/meson-js
[coveralls-image]: https://img.shields.io/coveralls/Bartpab/meson-js.svg?style=flat
[coveralls-url]: https://coveralls.io/r/Bartpab/meson-js?branch=master
