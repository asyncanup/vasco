var vasco = require('../..');
var request = require('request');
var log = require('debug')('example:user');
var ip = require('ip').address();
var app = require('express')();

app.get('/', function (req, res) {
  var depUrls = app.get('depUrls');
  if (!depUrls || !depUrls.service) {
    return res.status(500).send('Service dependencies not available yet');
  }
  log('deps.service', depUrls.service);
  var url = 'http://' + depUrls.service;
  request.get({ url: url, json: true }, function (err, response, body) {
    if (err) { return res.status(500).send(err.message); }
    if (response.statusCode !== 200) {
      return res.status(response.statusCode).send(body);
    }
    log('body', body);
    if (body.ping !== 'PONG') {
      return res.status(404).send('Incorrect response from service: ' + body);
    }
    res.send('success!');
  });
});

app.listen(process.env.SERVICE_PORT, function () {
  var address = ip + ':' + this.address().port;
  var pkg = require('./package');
  log('address', address);
  vasco.register(address, pkg, function (err, depUrls) {
    if (err) {
      console.error('Could not register with vasco');
      throw err;
    }
    log('depUrls', depUrls);
    app.set('depUrls', depUrls);
  });
});