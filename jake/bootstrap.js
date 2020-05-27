#!/usr/bin/env node
// LICENSE_CODE MIT
// XXX: use src/util/proc.js instead of spawn
const {spawnSync} = require('child_process');
const path = require('path');
const fs = require('fs');
let is_mac = spawnSync('uname', [],
  {encoding: 'utf-8'}).stdout.trim()=='Darwin';
let is_ci = process.env.CI||process.argv.includes('--ci');
let _p = spawnSync('xsu', [], {encoding: 'utf-8'});
let is_xsu = !_p.error||_p.error&&!_p.error.code;
let su = is_xsu ? 'xsu' : is_mac ? 'exec' : 'sudo';
_p = spawnSync('yarn', ['--version'], {encoding: 'utf-8'});
let npm = !_p.error||_p.error&&!_p.error.code&&!is_mac ? 'yarn' : 'npm';
let E = module.exports;

const j2s = o=>{ return JSON.stringify(o, null, 2); };

let spawn = (argv, cwd, is_print, shell, env)=>{
  env = env||process.env;
  console.log(argv.join(' '));
  let stdio = is_print ? 'inherit' : undefined;
  return spawnSync(argv.shift(), argv, {encoding: 'utf-8', stdio, cwd, shell,
    env});
};

let spawn_e = (argv, cwd, is_print, shell, env)=>{
  let res = spawn(argv, cwd, is_print, shell, env);
  if (res.status)
    xexit(`${argv.join(' ')} failed: ${j2s(res)}`);
  return res;
};

E.apt = (lib, ver, is_update)=>{
  let _lib = lib+(ver ? '-'+ver : '');
  if (is_update)
    xexit(_lib+' apt no update need to add support');
  spawn_e([su, 'apt', 'update', '&&', su, 'apt', '-y', 'install', _lib],
    __dirname, true, true);
};

E.brew = (lib, ver, is_update, hash)=>{
  let _lib = hash ? 'https://raw.githubusercontent.com/Homebrew/homebrew-core/'
    +hash+'/Formula/'+lib+'.rb' : lib+(ver ? '@'+ver : '');
  spawn_e(['brew', 'install', _lib], __dirname, true, true);
};

E.brew_cask = (lib, ver, is_update, hash)=>{
  let _lib = hash ? 'https://raw.githubusercontent.com/Homebrew/homebrew-cask/'
    +hash+'/Casks/'+lib+'.rb' : lib+(ver ? '@'+ver : '');
  if (is_update)
    xexit(lib+' brew_cask no update need to add support');
  spawn_e(['brew', 'cask', 'install', _lib], __dirname, true, true);
};

E.npm = (lib, is_update, ver)=>{
  let _lib = lib+(ver ? '@'+ver : '');
  let cmd = [];
  if (npm=='npm' || is_ci)
    cmd.push(su);
  cmd.push(npm);
  cmd.push(npm=='yarn' ? 'global' : '-g');
  if (is_update)
    cmd.push('update');
  else
    cmd.push(npm=='yarn' ? 'add' : 'install');
  cmd.push(_lib);
  spawn_e(cmd, __dirname, true, true);
};

E.pip = (lib, is_update, ver)=>{
  let _lib = lib+(ver?`==${ver}`:'');
  let cmd = ['python3', '-m', 'pip', 'install'];
  if (!is_ci && !is_mac)
    cmd.push('--user');
  cmd.push(_lib);
  if (is_ci)
    cmd.unshift(su);
  spawn_e(cmd, __dirname, true, true);
};

E.require_optional = mod=>{
  let ret;
  // eslint-disable-next-line global-require
  try { ret = require(mod); } catch(e) {}
  return ret;
};

E.detect_lib = opt=>{
  let lib_path = opt.lib_path||(is_mac ? '/usr/local/bin' : '/usr/bin');
  let ver_cmd = (opt.lib_path?opt.lib_path+'/':'')+(opt.ver_cmd||opt.lib);
  // XXX: use which for path of bin
  let mod = opt.mod&&E.require_optional(opt.lib);
  let mod_exist = !opt.mod || mod;
  if (opt.is_update || !(fs.existsSync(ver_cmd)
    || fs.existsSync(lib_path+'/'+ver_cmd)
    || fs.existsSync(process.env.HOME+'/.local/bin/'+ver_cmd)) || !mod_exist)
  {
    let _lib = opt.installer_lib||opt.lib;
    switch (opt.installer)
    {
    case 'npm': E.npm(_lib, opt.is_update&&0, opt.ver); break;
    case 'pip': E.pip(_lib, opt.is_update, opt.ver); break;
    case
      'brew_cask': E.brew_cask(_lib, opt.ver, opt.is_update, opt.hash);
      break;
    default:
      if (is_mac)
      {
        E.brew(_lib, opt.ver, opt.is_update, opt.hash);
        break;
      }
    // eslint-disable-next-line no-fallthrough
    case 'apt': E.apt(_lib, opt.ver, opt.is_update); break;
    }
  }
  let p = spawn([ver_cmd, '--version'], __dirname, false, true);
  if (opt.cb)
    opt.cb(p);
  if (!opt.ver_regex && opt.ver)
    opt.ver_regex = new RegExp(opt.ver.replace(/\./ug, '\\.'), 'u');
  if (opt.ver_regex instanceof RegExp)
    opt.ver_regex = [opt.ver_regex];
  let i = 0;
  for (; i<opt.ver_regex.length; i++)
  {
    if (opt.ver_regex[i].test(p.stdout))
      break;
  }
  let is_no_ver = opt.ver_regex.length==i;
  if (is_no_ver)
  {
    if (!opt.is_update)
      E.detect_lib(Object.assign({is_update: true}, opt));
    else
      xexit(`invalid version of ${opt.lib}\n${j2s(p)}`);
  }
  if (!opt.is_update)
    console.log(`${opt.lib} OK`);
};

let xexit = (...args)=>{
  throw new Error(args.join(' '));
};

let detect_sudo = ()=>{
  if (fs.existsSync('/usr/local/bin/xsu'))
    su = 'xsu';
  console.log('sudo OK');
};

let detect_node = ()=>{
  let node_ver = fs.readFileSync(path.join(__dirname, 'bootstrap.sh'), 'utf8');
  node_ver = node_ver.matchAll(/node_ver='(v[0-9.]+)'/gu);
  node_ver = [...node_ver];
  let node_vers = [];
  for (let i=0; i<node_ver.length; i++)
    node_vers.push(node_ver[i][1]);
  // eslint-disable-next-line
  if (!is_mac && !fs.existsSync('/usr/bin/node')
    && !fs.existsSync('/usr/local/bin/node'))
  {
    xexit('node not installed, run:\n./jake/bootstrap.sh');
  }
  _p = spawnSync('node', ['--version'], {encoding: 'utf-8'});
  let found;
  for (let i=0; i<node_vers.length; i++)
  {
    if (!_p.stdout.includes(node_vers[i]))
      continue;
    found = true;
    break;
  }
  if (!found)
  {
    xexit(`node version incorrect ${_p.stdout}!=${node_vers}`
      +'\nrun:\n./jake/bootstrap.sh');
  }
  console.log('node OK');
};

let detect_jake = ()=>{
  let f, ver = '8.1.1';
  try { f = fs.readFileSync('./package.json', 'utf8'); } catch(e) {}
  if (f)
    ver = JSON.parse(f).devDependencies.jake;
  E.detect_lib({lib: 'jake', installer: 'npm', ver, mod: true});
};

detect_sudo();
detect_node();
detect_jake();
