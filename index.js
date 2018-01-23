const redis = global.redis || require('redis');
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

  const getURLKey = name => 'endpoints.' + name + '@' + dependencies[name];
  const getAliveKey = url => 'alive.' + url;
  const serviceDepNames = depNames.filter(name => !mockDeps[name]);
  getActiveURLs(serviceDepNames, depUrls, done);
  
  function getActiveURLs(deps, activeURLs, callback) {
    if (!deps.length) { return callback(null, activeURLs); }
    
    const urlBatch = db.batch();
    deps.forEach(name => urlBatch.srandmember(getURLKey(name)));
    urlBatch.exec((urlErr, urls) => {
      if (urlErr) { return callback(urlErr); }
      for (let i = 0; i < urls.length; i++) {
        if (!urls[i]) { return callback(new Error('No service:' + deps[urls[i]])); }
      }
      
      const activeBatch = db.batch();
      urls.forEach(url => activeBatch.get(getAliveKey(url)));
      activeBatch.exec((activeErr, activeValues) => {
        if (activeErr) { return callback(activeErr); }
        deps
          .filter((name, index) => activeValues[index])
          .forEach((name, index) => activeURLs[name] = urls[index]);

        const cleanUpBatch = db.batch();
        deps
          .map((name, index) => ({ name, alive: activeValues[index], url: urls[index] }))
          .filter(dep => !dep.alive)
          .forEach(dep => cleanUpBatch.srem(getURLKey(dep.name), dep.url));
        cleanUpBatch.exec(cleanUpErr => {
          if (cleanUpErr) { return callback(cleanUpErr); }

          const missingDeps = deps.filter((name, index) => !activeValues[index]);
          getActiveURLs(missingDeps, activeURLs, callback);
        });
      });
    });
  }
}

function register(url, pkg, done) {
  if (!url) { return done(new Error('Need url of service')); }
  if (!pkg || !pkg.name || !pkg.version) { return done(new Error('Invalid package')); }
  const opts = pkg.vasco || {};
  const aliveDuration = opts.aliveDuration || 10; // seconds

  connectDB();
  findDependencies(opts.dependencies || {}, opts.mocks || {}, (err, depUrls) => {
    log('found dependencies:', depUrls);
    if (err) { return done(err); }
    const urlKey = 'endpoints.' + pkg.name + '@' + pkg.version;
    db.sadd(urlKey, url, err => {
      if (err) { return done(err); }
      db.end(true);
      log('registered:', url)
      setServiceHealth(url, err => done(err, depUrls));
    });
  });

  function setServiceHealth(url, callback) {
    const key = 'alive.' + url;
    callback = callback || (err => { if (err) throw err; });
    
    connectDB();
    db.set(key, true, 'EX', aliveDuration, err => {
      if (err) { return callback(err); }
      db.end(true);
      setTimeout(setServiceHealth, aliveDuration * 1000, url);
      callback();
    });
  }
}

module.exports = { findDependencies, register };
