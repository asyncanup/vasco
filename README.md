# node-vasco

Service Discoverer node module

## Install

    npm install vasco


## Use

    VASCO_URL=127.0.0.1:6379 node app.js

If not supplied, `VASCO_URL` gets the default value `127.0.0.1:6379`.

Inside `app.js`,

    var vasco = require('vasco');
    vasco.register(selfUrl, require('./package'), function (err, deps) {
      if (err) {
        // some error happened in registering self
        // or getting dependency urls
        return;
      }
      // deps is a hash of dependency names (as defined in package.json)
      // with active urls
      console.log(deps);
    });
    