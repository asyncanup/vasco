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
  const depKeys = depNames.map(depName => depName + '@' + dependencies[depName]);
  log('depKeys', depKeys);

  let total = depKeys.length;
  if (!total) { return done(null, {}); }

  depNames.forEach((depName, index) => {
    if (mockDeps[depName]) { return gotMockDepUrl(depName, mockDeps[depName]); }
    const key = depKeys[index];
    const dbKey = 'endpoints.' + key;
    db.srandmember(dbKey, gotDepUrl(depName, key, dbKey));
  });

  function gotDepUrl(depName, key, dbKey) {
    return (err, url) => {
      if (err) { return done(err); }
      if (!url) { return done(new Error('No service found for ' + key)); }
      log('url for dep', key, url);

      db.get('alive.' + url, (err, alive) => {
        if (err) { return done(err); }
        log('url alive:', url, alive);
        if (!alive) {
          return db.srem(dbKey, url, err => {
            if (err) { return done(err); }
            db.srandmember(dbKey, gotDepUrl(key, dbKey));
          });
        }
        log('url for alive dep', key, url);
        depUrls[depName] = url;
        total -= 1;
        if (!total) { return done(null, depUrls); }
      });
    };
  }
  function gotMockDepUrl(depName, url) {
    if (!url) { return done(new Error('No mock service found for', depName)); }
    depUrls[depName] = url;
    total -= 1;
    if (!total) { return done(null, depUrls); }
  }
}

function register(url, pkg, done) {
  if (!url) { return done(new Error('Need url of service')); }
  if (!pkg || !pkg.name || !pkg.version) { return done(new Error('Invalid package')); }
  const opts = pkg.vasco || {};
  const aliveDuration = opts.aliveDuration || 10; // seconds

  connectDB();
  findDependencies(opts.dependencies || {}, opts.mocks || {}, (err, depUrls) => {
    if (err) { return done(err); }
    const name = pkg.name + '@' + pkg.version;
    db.sadd('endpoints.' + name, url, err => {
      if (err) { return done(err); }
      db.end(true);
      pingHealth(url, err => {
        if (err) { return done(err); }
        setInterval(pingHealth, aliveDuration * 1000, url);
        done(null, depUrls);
      });
    });
  });

  function pingHealth(url, callback) {
    const key = 'alive.' + url;
    callback = callback || (err => { if (err) throw err; });
    
    connectDB();
    db.set(key, true, err => {
      if (err) { return callback(err); }
      db.expire(key, aliveDuration, err => {
        callback(err);
        db.end(true);
      });
    });
  }
}

module.exports = { findDependencies, register };

