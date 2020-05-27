// LICENSE_CODE MIT
'use strict';
const fs = require('fs');
const shim = require('../src/util/shim.js');
const yaml = shim.require_optional('yamljs');
const eserf = require('../src/util/eserf.js');
const proc = require('../src/util/proc.js');
const str = require('../src/util/str.js');
const jake = global.jake;
let g_fail = module.parent.id.includes('Jakefile.js') ? jake.fail : msg=>{
  throw new Error(msg);
};

let E = module.exports;
E.spawn = proc.spawn;
E.spawn_e = proc.spawn_e;
E.require_optional = shim.require_optional;
E.trim = str.trim;
E.trimh = str.trimh;
E.s2a = str.s2a;

// XXX: move into src/util/fs.js
E.touch = file=>{
  fs.writeFileSync(file, '');
};

E.fs = {
  read: f=>{
    let ret;
    try {
      ret = fs.readFileSync(f, 'utf8');
    } catch(e) {}
    return ret;
  },
  read_e: f=>fs.readFileSync(f, 'utf8'),
  exist: f=>fs.existsSync(f),
  touch: E.touch,
};

E.j2yml = json=>{
  return yaml.stringify(json, 4, 4, true);
};

let preinit = ()=>{
  E.argv = {};
  E.bin = {};
  E.path = {};
  E.is_ci = process.env.CI||process.argv.includes('--ci');
  E.is_debug = process.argv.includes('--debug');
  E.is_verbose = process.argv.includes('--verbose');
  E.argv.is_debug = E.is_debug;
  E.is_stack = process.argv.includes('--stack')||E.is_debug;
  E.argv.is_stack = E.is_stack;
  E.is_prod = process.argv.includes('--prod');
  E.argv.is_prod = E.is_prod;
  E.is_dev = process.argv.includes('--dev');
  E.argv.is_dev = E.is_dev;
  E.is_debug_test = process.argv.includes('--debug_test');
  E.is_local = !E.is_prod && !E.is_dev;
  E.argv.is_local = E.is_local;
  E.is_local_client = process.argv.includes('--local_client');
  E.argv.is_local_client = E.is_local_client;
  E.is_minify = process.argv.includes('--minify');
  E.argv.is_minify = E.is_minify;
  E.is_mac = E.spawn_e(['uname'], __dirname, null, null, null, true)
    .stdout.trim()=='Darwin';
  E.path_bin_sls = {};
  let pa = E.path_all(__dirname);
  let argv_json = E.fs.read(pa.root+'/build/argv.json');
  E.is_argv_changed = argv_json!=JSON.stringify(E.argv);
  E.su = 'sudo';
  if (fs.existsSync('/usr/local/bin/xsu'))
    E.su = 'xsu';
  else if (E.is_mac)
    E.su = 'eval';
};

// XXX: move into pm.js
E.npm = (lib, opt)=>{
  let cmd = ['yarn'];
  if (opt.global)
    cmd.push('global');
  if (opt.run)
    cmd.push('run', opt.run);
  else
    cmd.push(opt.global ? 'add' : 'install');
  opt = opt||{};
  if (opt.su)
    cmd.unshift(E.su);
  // XXX: overwrite, understand bug
  if (opt.path_module)
    cmd.push('--modules-folder', opt.path_module+'/node_modules/');
  if (opt.no_dev)
    cmd.push('--production');
  if (opt.dev)
    cmd.push('--production=false');
  if (lib)
    cmd.push(lib);
  E.spawn_e(cmd, opt.path||__dirname, true, true);
};

// XXX: make global not default and use alwasy target_dir, always use
// --sytem unless installing for env
E.pip = (lib, opt)=>{
  opt = opt||{};
  let cmd = ['python3', '-m', 'pip', 'install'];
  if (opt.su || E.is_ci && !opt.system)
    cmd.unshift(E.su);
  if (opt.dep_file)
    cmd.push('-r', opt.dep_file);
  if (opt.target_dir)
    cmd.push('-t', opt.target_dir);
  if (lib)
    cmd.push(lib+(opt.ver?`==${opt.ver}`:''));
  E.spawn_e(cmd, opt.path||__dirname, true, true);
};

let _path_root;
E.path_get_root = ()=>{
  if (_path_root)
    return _path_root;
  let path_real, path = '.', is_root_dir;
  while ((path_real=fs.realpathSync(path))&&path_real!='/')
  {
    is_root_dir = fs.existsSync(path+'/LICENSE');
    path = `../${path}`;
    if (!is_root_dir)
      continue;
    break;
  }
  if (!is_root_dir)
    throw new Error('not inside source dir');
  _path_root = path_real;
  return path_real;
};

// XXX: bin -> build
E.path_bin = _path=>{
  let path = fs.realpathSync(_path);
  let path_root = E.path_get_root();
  let path_root_bin = E.path_get_root()+'/build';
  if (path==path_root)
    return path_root_bin;
  return `${path_root_bin}/`+path.substr(path_root.length+1);
};

E.path_all = _path=>{
  let root = E.path_get_root();
  return {root: root, root_src: root, root_bin: root+'/build',
    bin: E.path_bin(_path), src: E.path_src(_path)};
};

E.path_src = path=>{
  E.path_get_root();
  return fs.realpathSync(path);
};

let _subdir = (path, dir)=>{
  if (!is_run_root)
  {
    // eslint-disable-next-line global-require
    return require(`${E.path_get_root()}/Jakefile.js`);
  }
  if (!path) // XXX: hack to not add another init and to call always
    return;
  let p = `${E.path_src(path)}/${dir}`;
  // XXX: figure out why this doens't work and need to use mkdir here
  // tasks.config.deps[p] = true;
  E.init(p);
  // eslint-disable-next-line global-require
  let ret = require(`${p}/Jakefile.js`);
  E.uninit();
  return ret;
};

E.subdir = (path, dir)=>{
  if (dir instanceof Array)
  {
    let ret = [];
    for (let i=0; i<dir.length; i++)
      ret.push(_subdir(path, dir[i]));
    return ret;
  }
  return [_subdir(path, dir)];
};

E.path_add = (path, files)=>{
  let ret = [];
  for (let i=0; i<files.length; i++)
    ret[i] = `${path}/${files[i]}`;
  return ret;
};

E.dirname = path=>{
  return path.match(/.*\//u)[0];
};

E.basename = path=>{
  return path.replace(/.*\//u, '');
};

let real_path_e = path=>{
  let dir = fs.realpathSync(E.dirname(path));
  let f = E.basename(path);
  return dir+'/'+f;
};

let real_path = path=>{
  try {
    return real_path_e(path);
  } catch(e) {}
  return path;
};

E._cp = (src, dst)=>{
  jake.cpR(src, dst);
};

E.cp = (_src, _dst, files, opt)=>{
  if (files instanceof Array)
  {
    let ret = [];
    for (let i=0; i<files.length; i++)
      ret.push(...E.cp(_src+'/'+files[i], _dst+'/'+files[i]));
    return ret;
  }
  let src = fs.realpathSync(_src);
  let dst = real_path_e(_dst);
  E.file(dst, [src], ()=>{
    if (opt.cpr_depricated)
    {
      jake.cpR(src, dst);
      return;
    }
    fs.copyFileSync(src, dst);
  });
  return [dst];
};

E.cp2bin = (dir, files)=>{
  let path_bin = E.path_bin(dir);
  let path_src = E.path_src(dir);
  return E.cp(path_src, path_bin, files);
};

E.ln = (_src, _dst, files, is_mkdir)=>{
  if (files instanceof Array)
  {
    let ret = [];
    for (let i=0; i<files.length; i++)
      ret.push(...E.ln(_src+'/'+files[i], _dst+'/'+files[i]));
    return ret;
  }
  let src = real_path_e(_src);
  let dir_dst = E.dirname(_dst);
  let path_root = E.path_get_root();
  if (is_mkdir&&dir_dst.startsWith(path_root+'/build'))
    E.mkdir_p(dir_dst);
  let dst = real_path_e(_dst);
  E.file(dst, [src], ()=>{
    if (fs.existsSync(dst))
      fs.unlinkSync(dst);
    fs.linkSync(src, dst);
  });
  return [dst];
};

E.ln2bin = (dir, files)=>{
  let path_bin = E.path_bin(dir);
  let path_src = E.path_src(dir);
  return E.ln(path_src, path_bin, files);
};

E._zip_e = (file, files, pa)=>{
  E.spawn_e(['zip', file, '-b', pa.bin,
    "'"+files.join('\' \'')+"'"], pa.bin, undefined, true);
};

E._tar_e = (file, files)=>{
  let path_root = E.path_get_root();
  E.spawn_e(['tar', 'zcf', file, '-C', `${path_root}/build/src`,
    "'"+files.join('\' \'')+"'"], `${path_root}/build/src`, undefined, true);
};

E.tar = (file, files, deps)=>{
  E.file(file, deps, ()=>{ E._tar_e(file, files); });
};

E.task2dep = task=>{
  let t = E.task[task], deps = [];
  if (!t)
    E.fail(`no task with name ${task}`);
  for (let o in t.deps)
    deps.push(o);
  return deps;
};

E.tasks = {};
let tasks = E.tasks;
let g_dir = [];
E.task = (id, deps, cb, opt)=>{
  let t = tasks[id] = tasks[id]||{};
  opt = opt||{};
  t.deps = t.deps||{};
  if (!opt.internal)
  {
    t.deps[g_dir[g_dir.length-1]] = true;
    t.deps[g_dir[g_dir.length-1]+'/Jakefile.js'] = true;
    if (E.files.config_phony)
      t.deps[E.files.config_phony] = true;
  }
  t.opt = t.opt||opt; // XXX: find another way to send opt
  t.id = id;
  t.type = opt.type||'task';
  if (E.is_stack)
  {
    t.stacks = t.stacks||[];
    t.stacks.push(new Error().stack);
  }
  t.cbs = t.cbs||[];
  if (cb)
    t.cbs.push(cb);
  for (let i=0; i<deps.length; i++)
    t.deps[deps[i]] = true;
  if (E.is_debug&&0)
    console.debug('task added to queue', t);
  return t;
};

let use_rule_src2bin_js = false;
E.file = (_file, deps, cb, opt)=>{
  let file = real_path_e(_file);
  if (use_rule_src2bin_js)
  {
    // XXX: add auto creation of E.file between src and bin
    let dir = E.dirname(file);
    let pa = E.path_all(dir);
    if (dir==pa.src && !fs.existsSync(file))
      E.fail(`never create files in source directory for ${file}`);
    // like rule src.js -> bin.js in build
    if (dir==pa.src)
      E.ln(pa.src, pa.bin, E.basename(file));
    for (let i=0; i<deps.length; i++)
      deps[i] = real_path(deps[i]);
  }
  return E.task(file, deps, cb, Object.assign({type: 'file'}, opt));
};

E.task_phony = (id, deps, cb, opt)=>{
  let pa = opt.pa;
  let f = pa.bin+'/'+id+'_phony';
  E.file(f, deps, ()=>{
    cb();
    E.touch(f);
  });
  E.task(id, [f], undefined, opt);
  return f;
};

let is_run_root;
E.init = (dir, is_root_dir, is_root)=>{
  E.opt = {};
  // XXX: use full parser or parserargs from jake
  let argv = process.argv;
  for (let i=0; i<argv.length; i++)
  {
    let arg = argv[i];
    let _arg = arg.split('=');
    if (arg.startsWith('--'))
      E.opt[_arg[0].substr(2)] = _arg[1];
  }
  if (is_root_dir)
  {
    if (E.is_debug)
      console.log('options args', E.opt);
  }
  // XXX: fix bug that get here multiple times
  E.is_root = is_root||E.is_root;
  if (!tasks.compile)
    E.task('compile', [], undefined, {desc: true, internal: true});
  if (!tasks.release)
    E.task('release', [], undefined, {desc: true, internal: true});
  if (!tasks.test)
    E.task('test', [], undefined, {desc: true, internal: true});
  if (!tasks.deploy)
    E.task('deploy', [], undefined, {desc: true, internal: true});
  is_run_root = is_run_root||is_root_dir;
  // XXX: create build dir of cwd
  let path_bin = E.path_bin(dir);
  jake.directory(path_bin);
  g_dir.push(dir);
  E.mkdir_p(path_bin);
};

const log_deps = (dep, depth)=>{
  depth = depth||0;
  if (!dep)
    return '';
  let tabs = '';
  for (let i=0; i<depth; i++)
    tabs += ' ';
  let t = tasks[dep];
  let type = !t||t.type=='file' ? 'file' : 'task';
  let ret = `${type} ${tabs}${dep}\n`;
  if (!t)
    return ret;
  for (let _dep in t.deps)
    ret += tabs+log_deps(_dep, depth+1);
  return ret;
};

E.uninit = is_root_dir=>{
  if (!g_dir.length)
    g_fail('missing j.init');
  g_dir.pop();
  if (!is_root_dir)
    return;
  let path_root_bin = E.path_get_root()+'/build';
  let file_deps = path_root_bin+'/deps.out';
  if (fs.existsSync(file_deps))
    fs.unlinkSync(file_deps);
  for (let _t in tasks)
  {
    let t = tasks[_t];
    let _deps = [];
    for (let d in t.deps)
      _deps.push(d);
    if (t.opt && t.opt.desc)
      jake.desc(' ');
    let cb = async function(...args){
      if (E.is_debug)
        console.log('task '+t.id+' start');
      if (!t.cbs.length)
      {
        if (E.is_debug)
          console.log('task '+t.id+' end');
        return;
      }
      let ess = [];
      // XXX: no need to allow many callbacks
      for (let i=0; i<t.cbs.length; i++)
        ess.push(t.cbs[i](...args));
      // XXX: spawn off of main sp
      await eserf(function*(){
        yield this.wait_ret(ess);
        if (E.is_debug)
          console.log('task '+t.id+' end');
      });
    };
    if (E.is_debug)
      console.log('task added', t);
    if (E.is_debug && E.is_verbose)
      console.log(log_deps(t.id));
    else
    {
      fs.appendFileSync(file_deps, 'task added\n'+E.j2s(t));
      fs.appendFileSync(file_deps, log_deps(t.id));
    }
    if (t.type=='file')
      jake.file(t.id, _deps, cb);
    else if (t.type=='task')
      jake.task(t.id, _deps, cb);
    else
      E.fail('unknown jake task '+t.type);
  }
};

E.is_not_run_root = ()=>{
  if (!is_run_root)
    return true;
};

let dirs = [];
E.pushd = dir=>{
  let cwd = process.cwd();
  dirs.push(cwd);
  process.chdir(dir);
};

E.popd = ()=>{
  process.chdir(dirs.pop());
};

E.j2s = str.j2s;

class Sls_cmd {
  constructor(dir){
    this.dir = dir;
  }

  static get env(){
    // XXX: fix serverless-localstack exec to have stdio ignore
    // 50mb due to stdio child maxbuffer localstack infra start
    // which call docker up
    let env = Object.assign({EXEC_MAXBUFFER: 100*1000*1000}, process.env);
    if (E.is_debug)
      env.SLS_DEBUG = '*';
    // XXX: move this code into src/system/docker
    if (E.is_local)
      env.LAMBDA_DOCKER_NETWORK = 'nodock_default';
    return env;
  }

  version(){
    return E.spawn(['sls', '--version'], this.dir,
      false, undefined, Sls_cmd.env);
  }

  plugin_install(plugin_name){
    return E.spawn_e(['sls', 'plugin', 'install', '-n', plugin_name],
      this.dir, true, undefined, Sls_cmd.env);
  }

  log(func_name, stage, param){
    return this.__execute('logs', func_name, null, stage, null, param);
  }

  deploy(func_name, stage){
    return this.__execute('deploy', func_name, undefined, stage);
  }

  remove(func_name, stage){
    if (stage!='local')
      E.fail('running sls remove with stage!=local is forbidden');
    return this.__execute('remove', undefined, undefined, stage);
  }

  invoke(func_name, data, stage = 'dev', local = false,
    // XXX: should use stage from j.opt.stage probably
    param = [], is_no_print = undefined){
    return this.__execute('invoke', func_name, data, stage, local,
      param, is_no_print);
  }

  __invoke(dry_run, func_name, msg, action, account_alias, region,
    is_no_print){
    let _msg = {Records: [{Sns: {
      Message: JSON.stringify(msg)
    }}]};
    if (action)
    {
      _msg.Records[0].Sns.TopicArn =
        `arn:aws:sns:${region}:${account_alias}:${action}`;
    }
    // XXX: move dry_run into Message and correct all lambdas
    if (dry_run)
      _msg.dry_run = dry_run;
    let p = this.__execute('invoke', func_name, _msg, E.opt.stage, null, null,
      is_no_print);
    if (p.stderr)
      console.error(p.stderr);
    console.log(p.stdout);
    let ret;
    if (p.stdout)
    {
      ret = p.stdout.split('----');
      ret = JSON.parse(ret[0]);
    }
    return ret;
  }

  invoke_action(func_name, msg, action, account_alias, region, is_no_print){
    return this.__invoke(false, func_name, msg, action, account_alias, region,
      is_no_print);
  }

  _invoke(func_name, msg){
    return this.__invoke(false, func_name, msg);
  }

  _invoke_dry_run(func_name, msg){
    return this.__invoke(true, func_name, msg);
  }

  __execute(command, func_name, data, stage, local, param = [],
    is_no_print){
    let cmd = ['sls', command, local ? 'local' : '', '--log'];
    if (func_name)
      cmd = cmd.concat(['--function', func_name]);
    if (stage)
      cmd = cmd.concat(['--stage', stage]);
    if (data)
      cmd = cmd.concat(['--data', "'"+JSON.stringify(data)+"'"]);
    return E.spawn_e(cmd.concat(param), this.dir, !is_no_print,
      true, Sls_cmd.env);
  }
}
E.Sls_cmd = Sls_cmd;

E.fail = (...args)=>{
  jake.fail(...args);
};

E.mkdir_p = (...args)=>{
  jake.mkdirP(...args);
};

E.dep = (path_src, path_bin, id, pkg, deps)=>{
  E.ln(path_src, path_bin, pkg);
  E.file(path_bin+'/'+id, E.path_add(path_bin, pkg).concat(deps||[]), ()=>{
    E.npm(undefined, {path: path_bin});
    // XXX: install into build/node_modules and use that path to load
    // modules
    E.touch(path_bin+'/'+id, '');
  });
};

E.dep_py = (pa, dep)=>{
  let ret = [];
  for (let d of dep)
  {
    let dst = pa.bin+'/'+d.dir+'/'+d.base;
    E.ln(pa.root+'/src/'+d.dir+'/'+d.base, dst, null, true);
    ret.push(dst);
  }
  return ret;
};

const test_run_python = path_bin=>{
  // XXX: add support for is_debug_test
  E.spawn_e(['python3', '-m', 'unittest', 'test.py'], path_bin, true, true);
};

const test_run_js = (path_bin, args)=>{
  args = args||[];
  let path_root = E.path_get_root();
  // XXX: fix passing env to support converting from true->1
  E.spawn_e([path_root+'/node_modules/mocha/bin/mocha', '-r',
    'mocha-plugin-co', 'test.js'].concat(E.is_debug_test
    ? ['--inspect-brk']: []).concat(args.length
    ? ['-g'].concat(args) : []), path_bin, true,
  true, Object.assign({}, process.env, {IS_TEST: 1}));
};

E.test_run = (path_bin, is_not_js, args)=>{
  if (is_not_js)
    return test_run_python(path_bin, args);
  test_run_js(path_bin, args);
};

// XXX: remove is_js
E.task_sls_func = (func, pkg, dir, dep, is_js, stack)=>{
  dep = dep||[];
  stack = stack||'back';
  let prefix = `sls_${stack}`;
  let pa = E.path_all(dir);
  let stack_func = prefix+'_'+func;
  E.ln(pa.src, pa.bin, pkg);
  let pkg_bin = E.path_add(pa.bin, pkg);
  let config_json = pa.bin+'/'+E.basename(E.files.config_json);
  pkg_bin = pkg_bin.concat(E.ln(E.files.config_json, config_json));
  let config_int_json = pa.bin+'/'+E.basename(E.files.config_int_json);
  pkg_bin = pkg_bin.concat(E.ln(E.files.config_int_json, config_int_json));
  // XXX: use path of sls_yml instead
  let path_bin_sls = E.path_bin_sls[stack];
  let sls = new E.Sls_cmd(path_bin_sls);
  if (pkg.includes('package.json'))
  {
    pkg_bin.push(`npm_i_${stack_func}`);
    E.task_phony(`npm_i_${stack_func}`, [pa.bin+'/package.json'], ()=>{
      E.npm(undefined, {path: pa.bin});
    }, {pa});
  }
  if (pkg.includes('requirements.txt'))
  {
    pkg_bin.push(`pip_i_${stack_func}`);
    E.task_phony(`pip_i_${stack_func}`, [pa.bin+'/requirements.txt'], ()=>{
      E.pip(undefined, {dep_file: pa.bin+'/requirements.txt', path: pa.bin,
        target_dir: pa.bin});
    }, {pa});
  }
  E.task(`compile_${stack_func}`, pkg_bin.concat(dep), ()=>{});
  E.task(`log_${stack_func}`, [`${prefix}_yml`, `${prefix}_install`],
    (start, filter)=>{
      let param = [];
      start = start||'30m';
      if (filter)
        param.push('--filter', filter);
      if (start)
        param.push('--startTime', start);
      sls.log(func, E.opt.stage, param);
    }, {desc: true});
  // XXX: use task_phony instead
  E.task(`release_${stack_func}`, [`compile_${stack_func}`], ()=>{
    // eslint-disable-next-line global-require
    const readdir_rec = require('fs-readdir-recursive');
    let add_node_modules;
    let files = readdir_rec(pa.bin, (name, idx, _dir)=>{
      if ((/__pycache__/u).test(_dir))
        return false;
      if ((/node_modules/u).test(_dir))
      {
        add_node_modules = true;
        return false;
      }
      if ((/\.zip/u).test(name))
        return false;
      return true;
    });
    if (add_node_modules)
      files.push(pa.bin+'/node_modules');
    let f = `sls_${func}_${E.is_prod?'rel':'dev'}.zip`;
    E._zip_e(f, files, pa);
  }, {pa});
  E.task(`compile_${prefix}`, [`compile_${stack_func}`], ()=>{}, {desc: true});
  E.task('compile', [`compile_${prefix}`], ()=>{}, {desc: true});
  E.task(`release_${prefix}`, [`release_${stack_func}`], ()=>{}, {desc: true});
  E.task('release_sls', [`release_${prefix}`], ()=>{}, {desc: true});
  E.task('release', [`release_${prefix}`], ()=>{}, {desc: true});
  E.task('compile_sls', [`compile_${prefix}`], ()=>{}, {desc: true});
  E.task('deploy_sls', ['release_sls'], ()=>{}, {desc: true});
  E.task(`deploy_${prefix}`, [`release_${prefix}`], ()=>{}, {desc: true});
  E.task(`deploy_${stack_func}`, [`release_${stack_func}`, `${prefix}_install`,
    `${prefix}_yml`], ()=>{
    sls.deploy(func, E.opt.stage);
  }, {desc: true});
};

E.task_test = (func, pkg, dir, is_not_js)=>{
  let pa = E.path_all(dir);
  let pkg_bin = E.path_add(pa.bin, pkg);
  E.ln(pa.src, pa.bin, pkg);
  // XXX: use compile instead of release
  E.task(`test_${func}`, [`release_${func}`].concat(pkg_bin),
    (...args)=>{
      E.test_run(pa.bin, is_not_js, args);
    }, {desc: true});
  E.task('test', [`test_${func}`], undefined, {desc: true});
};

E.task_sls_test = (func, pkg, dir, stack, is_not_js)=>{
  stack = stack||'back';
  let prefix = `sls_${stack}`;
  let pa = E.path_all(dir);
  let stack_func = prefix+'_'+func;
  let pkg_bin = E.path_add(pa.bin, pkg);
  E.ln(pa.src, pa.bin, pkg);
  E.task(`test_${stack_func}`, [`${prefix}_install`, `compile_${stack_func}`,
    `${prefix}_yml`].concat(pkg_bin), (...args)=>{
    E.test_run(pa.bin, is_not_js, args);
  }, {desc: true});
  E.task(`test_${prefix}`, [`test_${stack_func}`], undefined, {desc: true});
  E.task('test', [`test_${stack_func}`], undefined, {desc: true});
};

E.find_list = (path, type)=>{
  let res = E.spawn_e(['find', path, '-type', type], path);
  let files = res.stdout.split('\n').filter(Boolean);
  return files;
};

E.file_src2bin = (pa, ignore)=>{
  let _dirs = E.find_list(pa.src, 'd');
  for (let i=0; i<_dirs.length; i++)
  {
    let dir = _dirs[i].replace(pa.src+'/', '');
    E.mkdir_p(pa.bin+'/'+dir);
  }
  let files = E.find_list(pa.src, 'f');
  let pkg = [];
  for (let i=0; i<files.length; i++)
  {
    let _f = files[i].replace(pa.src+'/', '');
    if (ignore&&ignore.test(_f))
      continue;
    E.ln(pa.src+'/'+_f, pa.bin+'/'+_f);
    pkg.push(pa.bin+'/'+_f);
  }
  return pkg;
};

E.s3 = {};
E.s3.cp = (src, dst)=>{
  let path_root_bin = E.path_get_root()+'/build';
  let cmd_cp = ['aws', 's3', '--profile', E.opt.stage, 'cp'];
  let p = E.spawn(cmd_cp.concat(src, dst), path_root_bin, true,
    true);
  if (p.status)
    E.fail(`s3 cp failed ${p}`);
};

E.s3.cat = src=>{
  let path_root_bin = E.path_get_root()+'/build';
  let cmd_cp = ['aws', 's3', '--profile', E.opt.stage, 'cp'];
  let dst = `/tmp/s3_cat_tmp_${process.pid}_${E.basename(src)}`;
  let p = E.spawn(cmd_cp.concat(src, dst), path_root_bin, true,
    true);
  if (p.status)
    E.fail(`s3 cp failed ${p}`);
  let ret = E.fs.read(dst);
  // XXX: delete tmp file
  return ret;
};

let s3_path = 's3://rightbound-deploy/ver';
E.s3.config_upload = ()=>{
  let path_root_bin = E.path_get_root()+'/build';
  let f = path_root_bin+'/config.js';
  E.s3.cp(f, s3_path+'/config.js');
};

E.s3.config_dl = ()=>{
  let f = E.s3.cat(s3_path+'/config.js');
  let ret = eval(f); // eslint-disable-line
  return ret;
};

E.s3.config_ver_get = ()=>{
  let config = E.s3.config_dl();
  return config.ver;
};

E.ssh = (_server, args)=>{
  E.spawn_e(['../src/system/env/xssh.js',
    `${_server}_${E.opt.stage}`].concat(args), __dirname, true, true);
};

E.task_server_deploy = (id, pa, pkg, opt={})=>{
  let env = opt.env||'';
  let pkg_bin = E.path_add(pa.bin, pkg);
  let systemd_file = pa.bin+`/node_${id}.service`;
  E.file(systemd_file, [E.files.xcred, E.files.argv_json], ()=>{
    fs.writeFileSync(systemd_file, `[Unit]
Description=${id}
After=network.target

[Service]
Type=simple
User=root
Environment=${env}
WorkingDirectory=/var/local/xserver/back/${id}
ExecStart=/usr/bin/node /var/local/xserver/back/${id}/main.js
Restart=always
[Install]
WantedBy=multi-user.target`);
  });
  pkg_bin.push(systemd_file);
  // XXX: move out of here as param
  let pkg_ext_util = ['eserf.js', 'events.js', 'util.js', 'sql.js', 'date.js',
    'ereq.js', 'xurl.js', 'str.js', 'package.json'];
  let pkg_ext_back_util = ['util.js', 'lambda.js', 's3.js', 'db.js', 'tz.js',
    'package.json', 'metric.js'];
  pkg_ext_back_util = E.path_add('back/util', pkg_ext_back_util);
  pkg_ext_util = E.path_add('util', pkg_ext_util);
  let config_int_js = pa.root_bin+'/src/back/config_int.js';
  let pkg_ext = pkg_ext_util.concat(pkg_ext_back_util);
  pkg.push(E.basename(systemd_file));
  pkg = E.path_add(`back/${id}`, pkg);
  pkg.push('back/'+E.basename(config_int_js));
  let f = `${pa.bin}/${id}.tar.gz`;
  let f_base = E.basename(f);
  let util_dep = pa.root_bin+'/src/util/util.dep';
  let back_util_dep = pa.root_bin+'/src/back/util/util.dep';
  E.tar(f, pkg.concat(pkg_ext),
    [util_dep, back_util_dep].concat(pkg_bin, config_int_js));
  let npm_i_file_dep = E.task_phony(`npm_i_${id}`, [pa.bin+'/package.json'],
    ()=>{
      E.npm(undefined, {path: pa.bin});
    }, {pa});
  let release_dep = [f, npm_i_file_dep];
  E.task(`release_${id}`, release_dep, ()=>{
  }, {desc: true});
  E.task('release', [`release_${id}`]);
  E.task(`setup_${id}`, [`release_${id}`, E.files.argv_json], ()=>{
    E.ssh(id, [E.trim(`"
      curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
      && sudo apt-get update && sudo apt-get install -y nodejs
      "`)]);
  });
  E.task(`deploy_${id}`, [`release_${id}`, E.files.argv_json], ()=>{
    // XXX: add detection of setup_${id} and run if not setup
    E.spawn_e(['../src/system/env/xscp.js', `${id}_${E.opt.stage}`, 'set',
      f, '/tmp/'], __dirname, true, true);
    // open new release and install npm packages needed
    // create dir structore of release on ec2
    // restart service
    E.ssh(id, [E.trim(`"
      sudo service node_${id} stop; sudo rm -rf /var/local/xserver_prev
      && if [ -d /var/local/xserver ]; then
        sudo mv /var/local/xserver /var/local/xserver_prev; fi
      && sudo mkdir /var/local/xserver
      && sudo cp /tmp/${f_base} /var/local/xserver/
      && cd /var/local/xserver && sudo tar xvpf ./${f_base}
      && cd ./back/${id} && sudo npm i
      && cd ../util && sudo npm i
      && cd ../../util && sudo npm i
      && cd ../back/${id} && sudo cp
      ./${E.basename(systemd_file)}
      /etc/systemd/system/${E.basename(systemd_file)}
      && sudo systemctl daemon-reload
      && sudo service node_${id} start
      "`)]);
  }, {desc: true});
  E.task('deploy', [`deploy_${id}`]);
  E.task(`log_${id}`, [], less=>{
    E.ssh(id, [`journalctl -u node_${id} `+(less ? '' : '-n 30 --no-pager')]);
  });
};

preinit();
