// LICENSE_CODE MIT
'use strict';
const net = require('net');
const mysql = require('mysql2');
const eserf = require('./eserf.js');
const date = require('./date.js');

let E = module.exports;
E.escape = mysql.escape;
E.escape_id = mysql.escapeId;

// XXX: get from server
let server_timeout_ms = 28800*date.MS_SEC;
let conn_cache = {};
let conn_cache_count = 0;
let __get_cache_name = (host, db)=>`${host}_${db}`;

// XXX: add support for timeout
E.connect = (host, db, user, passwd, port=3306, timeout=5000, no_throw)=>eserf(
  function* sql_connect(){
    let cache_id = __get_cache_name(host, db);
    let conn = conn_cache[cache_id];
    let cancelled;
    this.finally(()=>{
      cancelled = true;
    });
    if (!conn)
    {
      let client = net.createConnection(+port, host);
      client.on('connect', ()=>{
        if (cancelled)
          return;
        this.continue({});
      });
      client.on('error', err=>{
        if (cancelled)
          return;
        this.continue({err});
      });
      let res = yield this.wait();
      if (res.err)
        return {err: res.err};
      try {
        conn = mysql.createConnection({
          host: host,
          user: user||'sysadmin',
          password: passwd||'sysadmin',
          database: db,
          port: +port,
          timezone: 'Z',
          connectTimeout: +timeout,
          stream: client,
        });
      } catch(e) { return {err: e}; }
      conn_cache[cache_id] = conn;
      conn_cache_count++;
      conn.es = E.es.spawn(eserf(function* sql_conn_keepalive(){
        while (true)
        {
          yield eserf.sleep(server_timeout_ms/2);
          yield E.query(conn, 'SELECT NULL');
        }
      }));
    }
    else
    {
      // XXX: add support for multiple connects at the same time
      return conn;
    }
    conn.connect((err, res)=>{
      // XXX: cancel+err will leave connection in cache
      if (cancelled)
        return;
      this.continue({ret: res, err});
    });
    let res = yield this.wait();
    if (res.err)
    {
      delete conn_cache[cache_id];
      conn_cache_count--;
      if (no_throw)
        return {err: res.err, msg: res.err};
      throw new Error(res.err);
    }
    return conn;
  });

E.query = (conn, query, opt)=>{
  let cancelled;
  opt = opt||{};
  return eserf({cancel: true, name: 'sql.select'}, [function(){
    if (opt.timeout)
    {
      this.alarm(opt.timeout, ()=>{
        this.return({err: true, msg: `timeout ${opt.timeout} query ${query}`});
      });
    }
    else
    {
      this.alarm(10*date.MS_SEC, ()=>{
        console.error('sql.query long more than 10sec '+query);
      });
    }
    conn.query(query, (err, res, fields)=>{
      if (cancelled)
        return;
      this.continue({ret: res, err});
    });
    return this.wait();
  }, function(res){
    if (res.err)
    {
      let s = `select failed query ${query}\n`
        +(res.err.sqlMessage||res.err.message);
      if (opt.no_throw)
        return this.return({err: new Error(s), msg: s});
      throw new Error(s);
    }
    return res.ret;
  }, ['cancel$', function(){
    cancelled = true;
  }]]);
};

E.init = ()=>{
  E.es = eserf({cancel: true, name: 'sql.init.wait'}, [function(){
    return this.wait();
  }]);
};

E.disconnect = conn=>eserf(function* disconnect(){
  let _conn_name = __get_cache_name(conn.config.host, conn.config.database);
  conn.es.return();
  conn.es = null;
  delete conn_cache[_conn_name];
  conn_cache_count--;
  conn.end(err=>{
    this.continue(err ? {err} : {});
  });
  let res = yield this.wait();
  if (res.err)
    console.error('sql disconnect failed', res.err);
});

E.is_conn_open = conn=>conn_cache_count;

E.uninit = ()=>{
  E.es.return();
  for (let _conn in conn_cache)
    E.disconnect(conn_cache[_conn]);
};

E.init();

