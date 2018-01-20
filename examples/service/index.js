var pick = require('object-pick');
var vasco = require('../..');
var ip = require('ip').address();
var log = require('debug')('example:service');
var app = require('express')();

app.get('/', function (req, res) {
  res.json({ ping: 'PONG' });
});

app.listen(function() {
  var port = this.address().port;
  var address = ip + ':' + port;
  var pkg = require('./package');
  log('address', address);

  vasco.register(address, pkg, function (err, depUrls) {
    if (err) {
      console.error('Could not register self as service');
      throw err;
    }
    log('depUrls', depUrls);
    app.set('depUrls', depUrls);
    log('started!');
  });
});
