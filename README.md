# node-vasco

Service Discoverer node module

## Install

    npm install vasco


## Use

    VASCO_HOST=localhost VASCO_PORT=6379 VASCO_PASS=redispassword \
    node app.js

Inside `app.js`,

    var vasco = require('vasco');
    vasco.register(selfUrl, require('./package'), function (err, deps) {
      if (err) {
        // some error happened in registering self
        // or getting dependency urls
        return;
      }
      // deps is a hash of dependency names (as defined in package.json)
      // with active urls ensure to be active
      console.log(deps);
    });
    