// LICENSE_CODE MIT
'use strict';
const fs = require('fs');
const {spawnSync, spawn} = require('child_process');
const str = require('./str.js');
const eserf = require('./eserf.js');

let E = module.exports;

// XXX: add eserf support
E.spawn = (argv, cwd, is_print, shell, env, no_console, detached)=>{
  env = env||process.env;
  cwd = cwd||process.cwd();
  if (typeof argv == 'string')
    argv = argv.split(' ');
  if (!no_console)
    console.log('cd '+cwd+' &&', argv.join(' '));
  let stdio = is_print ? 'inherit' : undefined;
  // XXX: add escaping if shell
  return spawnSync(argv.shift(), argv,
    {encoding: 'utf-8', stdio, cwd, shell, env, detached});
};

E.spawn_e = (argv, cwd, is_print, shell, env, no_console)=>{
  if (typeof argv == 'string')
    argv = argv.split(' ');
  let res = E.spawn(argv, cwd, is_print, shell, env, no_console);
  if (res.status || res.errno)
    throw new Error(`${argv.join(' ')} failed: ${str.j2s(res)}`);
  return res;
};

const escape2single = s=>{
  s = ''+s;
  if (!s)
    return '""';
  // eslint-disable-next-line no-useless-escape
  if ((/^[a-z0-9_\-.\/:]+$/ui).test(s))
    return s;
  return '"'+s.replace(/([\\"`$])/ug, '\\$1')+'"';
};

E.escape = (...args)=>{
  let _a = args[0];
  if (args.length==1 && !Array.isArray(_a))
    return escape2single(_a);
  let s = '', a = Array.isArray(_a) ? _a : args;
  for (let i=0; i<a.length; i++)
    s += (i ? ' ' : '')+escape2single(a[i]);
  return s;
};

E.espawn = (argv, cwd, is_print, shell, env, no_console, detached,
  is_ignore)=>eserf(function* espawn(){
  env = env||process.env;
  cwd = cwd||process.cwd();
  if (typeof argv == 'string')
    argv = argv.split(' ');
  if (!no_console)
    console.log('cd '+cwd+' &&', argv.join(' '));
  let stdio = is_print ? 'inherit' : is_ignore ? 'ignore' : undefined;
  // XXX: add escaping if shell
  let p = spawn(argv.shift(), argv,
    {encoding: 'utf-8', stdio, cwd, shell, env, detached});
  if (!stdio)
  {
    p.stdout.on('data', data=>{});
    p.stderr.on('data', data=>{
      console.error(`stderr: ${data}`);
    });
  }
  p.on('close', code=>{
    if (code!=0)
      console.log(`process exited with code ${code}`);
    this.continue({code: code});
  });
  let res = yield this.wait();
  return {...p, code: res.code};
});

E.espawn_e = (argv, cwd, is_print, shell, env, no_console, detached,
  is_ignore)=>eserf(
  function*(){
    if (typeof argv == 'string')
      argv = argv.split(' ');
    let p = yield E.espawn(argv, cwd, is_print, shell, env, no_console,
      detached, is_ignore);
    if (p.exitCode)
      throw new Error(`${argv.join(' ')} failed: ${str.j2s(p)}`);
    return p;
  });
E.init = ()=>{
  process.on('uncaughtException', (err, origin)=>{
    fs.writeSync(process.stderr.fd, `caught exception ${err}\n`
      +`origin ${origin}`);
  });
  process.on('exit', (...args)=>{
    console.log(...args);
  });
};
