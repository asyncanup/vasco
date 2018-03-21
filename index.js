const redis = require('redis');
const log = require('debug')('vasco');

let db;
function connectDB() {
  db = redis.createClient(process.env.VASCO_URL);
  db.on('error', err => { throw err; });
}

function findDependencies(dependencies, mockDeps, done) {
  const depUrls = {};
  const depNames = Object.keys(dependencies);
  depNames
    .filter(name => !!mockDeps[name])
    .forEach(name => depUrls[name] = mockDeps[name]);

  const getServiceKey = name => name + '@' + dependencies[name];
  const getURLKey = name => 'endpoints.' + getServiceKey(name);
  const getAliveKey = url => 'alive.' + url;
  const serviceDepNames = depNames.filter(name => !mockDeps[name]);
  getAliveURLs(serviceDepNames, depUrls, done);
  
  function getAliveURLs(deps, aliveURLs, callback) {
    if (!deps.length) { return callback(null, aliveURLs); }
    
    log('reqeusted dependencies:', deps);
    const urlBatch = db.batch();
    deps.forEach(name => urlBatch.srandmember(getURLKey(name)));
    urlBatch.exec((urlErr, urls) => {
      if (urlErr) { return callback(urlErr); }
      log('found endpoints:', urls);
      for (let i = 0; i < urls.length; i++) {
        if (!urls[i]) {
          return callback(new Error('No url for: ' + deps[i]));
        }
      }
      
      const aliveBatch = db.batch();
      urls.forEach(url => aliveBatch.get(getAliveKey(url)));
      aliveBatch.exec((aliveErr, aliveValues) => {
        if (aliveErr) { return callback(aliveErr); }
        log('alive status for endpoints:', aliveValues);
        const cleanUpBatch = db.batch();
        deps.forEach((name, index) => {
          if (aliveValues[index] === getServiceKey(name)) {
            aliveURLs[name] = urls[index];
          } else if (!aliveValues[index]) {
            log('cleanup endpoint:', urls[index]);
            cleanUpBatch.srem(getURLKey(name), urls[index]);
          }
        });
        cleanUpBatch.exec(cleanUpErr => {
          if (cleanUpErr) { return callback(cleanUpErr); }
          const missingDeps = deps.filter((name, index) =>
            aliveValues[index] !== getServiceKey(name));
          log('request missing dependencies', missingDeps);
          getAliveURLs(missingDeps, aliveURLs, callback);
        });
      });
    });
  }
}

function register(url, pkg, done) {
  if (!url) { return done(new Error('Need url of service')); }
  if (!pkg || !pkg.name || !pkg.version) {
    return done(new Error('Invalid package'));
  }
  const opts = pkg.vasco || {};
  const aliveDuration = opts.aliveDuration || 10; // seconds
  const pkgNameVersion = pkg.name + '@' + pkg.version;

  connectDB();
  findDependencies(opts.dependencies || {}, opts.mocks || {}, (err, depUrls) => {
    log('found dependencies:', depUrls);
    if (err) { return done(err); }
    const urlKey = 'endpoints.' + pkgNameVersion;
    db.sadd(urlKey, url, err => {
      if (err) { return done(err); }
      db.end(true);
      log('registered endpoint:', url);
      setServiceHealth(url, err => done(err, depUrls));
    });
  });

  function setServiceHealth(url, callback) {
    const key = 'alive.' + url;
    callback = callback || (err => { if (err) throw err; });
    
    connectDB();
    db.set(key, pkgNameVersion, 'EX', aliveDuration, err => {
      if (err) { return callback(err); }
      db.end(true);
      setTimeout(setServiceHealth, aliveDuration * 1000, url);
      callback();
    });
  }
}

module.exports = { findDependencies, register };



