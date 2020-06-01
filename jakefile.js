// LICENSE_CODE MIT
'use strict';
let user_id = process.env.USER;
let home_path = process.env.HOME;
const fs = require('fs');
// eslint-disable-next-line global-require
const jake = global.jake||require('jake');
global.jake = jake; // circleci didnt work without
const usage = ()=>{
  console.log('usage: xjake [options...] [jake_args...]');
  console.log('  --cred FILE location of credential file '
    +'(default ~/.xcred.js');
  console.log('  --prod use for releasing production');
  console.log('    example:');
  console.log('      xjake compile_sls_back --prod');
  console.log('  --dev use for releasing to development');
  console.log('    example:');
  console.log('      xjake compile_sls_back --dev');
  console.log('  --local_client use for testing api from prod/dev');
  console.log('    with localhost redirections');
  console.log('    example:');
  console.log('      xjake run_dash --local_client --prod');
  console.log('  --minify use use minify of code for dash/bo');
  console.log('    example:');
  console.log('      xjake run_dash --minify');
  console.log('  -T show task list');
  console.log('  --verbose show more output for --debug');
  console.log('  --debug show debug objects including all tasks and deps');
  console.log('  --debug_test allow to debug mocha tests');
  console.log('  --ci use when runnig in circleci build system');
  console.log('  --stack show stack of location where tasks added');
  console.log('  --stage [stage] what stage to use for deploy');
  console.log('    example:');
  console.log('      xjake compile_sls --stage dev');
  console.log('      xjake compile_sls --stage prod');
  console.log('example:');
  console.log('  xjake compile_sls');
  console.log('  xjake docker_up_init');
  process.exit(0);
};
let args = process.argv.slice(2);
if (process.argv.includes('--help'))
{
  jake.run(...args);
  usage();
}
let t_cb, _t_cb = ()=>{
  console.log('tasks:');
  let tasks_arr = [];
  for (let id in j.tasks)
  {
    let _task = j.tasks[id];
    if (!_task.opt.desc)
      continue;
    tasks_arr.push(id+(_task.stacks||''));
  }
  tasks_arr.sort((a, b)=>a.localeCompare(b));
  for (let i=0; i<tasks_arr.length; i++)
    console.log('  '+tasks_arr[i]);
  process.exit(0);
};
if (process.argv.includes('-T'))
  t_cb = _t_cb;
let fail = jake.fail;
const j = require('./jake/util.js');
const bootstrap = require('./jake/bootstrap.js');
const detect_lib = bootstrap.detect_lib;
let is_mac = j.is_mac;

let detect_python3 = ()=>{
  // XXX: use on mac 3.6 so will use same version
  // installer_lib: 'https://raw.githubusercontent.com/'
  // +'Homebrew/homebrew-core/'
  // +'f2a764ef944b1080be64bd88dca9a1d80130c558/Formula/python.rb'
  detect_lib({lib: is_mac ? 'python' : 'python3', ver_cmd: 'python3',
    hash: '42cc8e9734d9a488dc774bd7b93e898ac4fd8907',
    ver_regex: [/^Python 3\.7\.[567]\n$/u, /^Python 3\.6\.[89]\n$/u,
      /^Python 3\.5\.3\n$/u, /^Python 3\.8\.0\n/u]});
};

let detect_python_module = ()=>{
  let p = j.spawn_e('python3 -m pip list');
  let arr = p.stdout.split('\n'), lib_curr = {};
  arr = arr.filter(Boolean);
  for (let a of arr)
  {
    let [_lib, ver] = a.split(' ').filter(Boolean);
    lib_curr[_lib.toLowerCase()] = ver;
  }
  let libs = [{lib: 'pip', ver: '20.1'}, {lib: 'sendgrid', ver: '6.2.1'},
    {lib: 'boto3', ver: '1.12.38'}, {lib: 'pymysql', ver: '0.9.3'},
    {lib: 'sshtunnel', ver: '0.1.5'}];
  for (let i=0; i<libs.length; i++)
  {
    if (lib_curr[libs[i].lib]==libs[i].ver)
      continue;
    j.pip(libs[i].lib, libs[i]);
  }
};

let detect_pip3 = ()=>{
  detect_lib({lib: 'pip3', installer_lib: 'python3-pip',
    ver_regex: [/pip 20\.0\.2 /u, /pip 19\.3\.1 /u,
      /^pip 9\.0\.1 /u, /pip 18\.1 /u, /pip 20.[0-9] /u]});
  detect_python_module();
};

let detect_python = ()=>{
  detect_python3();
  detect_pip3();
  if (is_mac)
  {
    detect_lib({lib: 'pyenv', ver_regex: /pyenv 1\.2\.16\n/u,
      installer_lib: 'https://raw.githubusercontent.com/Homebrew/'
      +'homebrew-core/'
      +'f4bf647042d074ad53cc09e2083730abe7dc9e1b/Formula/pyenv.rb'});
  }
};

let detect_flake8 = ()=>{
  detect_lib({lib: 'flake8', installer: 'pip', ver: '3.7.9'});
};

let detect_yapf = ()=>{
  detect_lib({lib: 'yapf', installer: 'pip', ver: '0.28.0'});
};

let detect_mysql = ()=>{
  // XXX: add support for ci using mariadb-client-10.1
  if (j.is_ci)
    return;
  if (is_mac)
  {
    detect_lib({lib_path: j.path.mysql, lib: 'mysql',
      installer_lib: 'mysql-client', ver: '5.7', installer: 'brew'});
    return;
  }
  detect_lib({lib: 'mysql', installer_lib: 'mysql-client', ver: '5.7'});
};


let detect_vim = ()=>{
  detect_lib({lib: 'vim', ver_regex: / 8\.[0-9] /u});
};

let detect_gvim = ()=>{
  if (is_mac)
  {
    detect_lib({lib: 'macvim', ver_cmd: 'gvim', ver_regex: / 8\.2 /u,
      hash: '1d683ab15e20b67303c007095f273503dac6c3d7',
    });
  }
  else
    detect_lib({lib: 'vim-gtk3', ver_cmd: 'vim', ver_regex: / 8\.[0-9] /u});
};

let detect_realpath = ()=>{
  if (is_mac)
  {
    detect_lib({lib: 'coreutils', ver_cmd: 'realpath',
      ver_regex: / 8\.31\n/u});
  }
};

let detect_git = ()=>{
  detect_lib({lib: 'git', ver_regex: [/ 2\.2[45]\.[01]/u, / 2.17.[01]\n$/u,
    / 2\.11\.0\n$/u]});
};

let detect_docker = ()=>{
  if (!is_mac)
  {
    if (!fs.existsSync('/usr/bin/docker'))
    {
      j.spawn_e(['curl', '-fsSL',
        'https://download.docker.com/linux/ubuntu/gpg', '|', j.su,
        'apt-key', 'add', '-'], __dirname, true, true);
      j.spawn_e([j.su, 'add-apt-repository', '"deb [arch=amd64] ' +
	'https://download.docker.com/linux/ubuntu bionic stable"'],
      __dirname, true, true);
      j.spawn_e([j.su, 'apt', 'update', '&&', 'apt-cache', 'policy',
        'docker-ce'], __dirname, true, true);
    }
    detect_lib({lib: 'docker', installer_lib: 'docker-ce',
      installer: 'apt', ver_regex: [/ 19\.03\.[2-9]/u]});
    detect_lib({lib: 'docker-compose', installer: 'apt',
      ver_regex: [/ 1\.(17|25)\.[0-9]+/u]});
    let s = j.fs.read('/etc/group');
    if (!(/^docker:/mu).test(s))
    {
      console.log('missing docker group, adding');
      j.spawn_e([j.su, 'groupadd', 'docker'], __dirname, true, true);
    }
    if (!new RegExp(`^docker:.*:${user_id}`, 'mu').test(s))
    {
      console.log(`missing ${user_id} in docker group in /etc/group, adding`);
      j.spawn_e([j.su, 'usermod', '-aG', 'docker', user_id], __dirname, true,
        true);
      console.log('logout and login so docker will work');
    }
    return;
  }
  const docker_install_cb = p=>{
    if (p.stderr.includes('docker: command not found'))
    {
      console.log('- launching docker (after text)\n'
	+'- click Open\n'
	+'- click OK\n'
	+'- enter password\n'
	+'- rerun xjake');
      j.spawn_e(['open', '/Applications/Docker.app'], __dirname, true,
        true);
      process.exit(1);
    }
  };
  detect_lib({lib: 'docker', installer: 'brew_cask',
    hash: '9174dadf17633319f8ce4cc8ceb8654ed53044c6',
    ver_regex: [/19\.03\.5/u, /19\.03\.2/u], cb: docker_install_cb});
};

let detect_eslint = ()=>{
  detect_lib({lib: 'eslint', installer: 'npm', ver: '6.5.1'});
};

let detect_nodemon = ()=>{
  detect_lib({lib: 'nodemon', installer: 'npm', ver: '2.0.2'});
};

let detect_ngrok = ()=>{
  detect_lib({lib: 'ngrok', installer: 'npm', ver: '3.2.7',
    ver_regex: [/2\.3\.35/u]});
};

let detect_webpack = ()=>{
  detect_lib({lib: 'webpack-cli', installer: 'npm', ver: '3.3.9'});
  detect_lib({lib: 'webpack', installer: 'npm', ver: '4.41.2'});
};

let detect_aws_cli = ()=>{
  detect_lib({installer_lib: 'awscli', lib: 'aws', installer: 'pip',
    ver: '1.18.38'});
};

let detect_sls = ()=>{
  detect_lib({lib: 'serverless', installer: 'npm', ver: '1.63.0'});
  detect_lib({lib: 'localstack', installer: 'pip', ver: '0.10.7'});
};

let detect_env = ()=>{
  detect_lib({lib: 'npm', installer: 'npm', ver: '6.13.1',
    ver_regex: [/6\.1[3-9]\.[0-9]/u]});
  if (is_host)
    return;
  detect_python();
  detect_lib({lib: 'ipython3', installer: 'pip', installer_lib: 'ipython',
    ver: '7.9.0'});
  detect_flake8();
  detect_yapf();
  detect_aws_cli();
  detect_mysql();
  if (!j.is_ci)
    detect_mycli();
  if (!j.is_ci)
    detect_mysqlworkbench();
  if (!j.is_ci)
    detect_gvim();
  if (!j.is_ci)
    detect_vim();
  detect_realpath();
  if (!j.is_ci)
    detect_git();
  if (!j.is_ci)
    detect_docker();
  detect_eslint();
  detect_webpack();
  if (!j.is_ci)
    detect_nodemon();
  if (!j.is_ci)
    detect_ngrok();
  detect_sls();
  // eslint-disable-next-line no-constant-condition
  if (j.is_ci&&0)
    detect_cc1();
};
let is_root = j.spawn_e(['id', '-u'], __dirname).stdout.trim()=='0';
let is_install = process.argv.includes('install');
let is_compile_host = process.argv.includes('compile_host');
let is_host = is_install||is_compile_host;
if (is_mac)
{
  j.path.mysql = '/usr/local/opt/mysql-client@5.7/bin';
  j.bin.mysqldump = j.path.mysql+'/mysqldump';
  j.bin.mysql = j.path.mysql+'/mysql';
}
else
{
  j.bin.mysqldump = 'mysqldump';
  j.bin.mysql = 'mysql';
}
if (is_install)
  detect_env();
if (is_root)
  fail('run NOT as root');
j.init(__dirname, true, is_root, is_mac);
let pa = j.path_all(__dirname);
let user, users;
// XXX: move this into bootstrap
detect_lib({lib: 'yarn', installer: 'npm', ver: '1.21.1'});
let npm_i_predirs = [pa.src];
for (let path of npm_i_predirs)
  j.npm(undefined, {path});
let is_run_once = fs.existsSync(pa.bin+'/npm_i_predir');
if (!is_run_once)
{
  // XXX: fix to update module paths so that can require after install
  j.touch(pa.bin+'/npm_i_predir');
  j.spawn(process.argv, process.cwd(), true, true, process.env, false, true,
    false);
  process.exit(0);
}
// eslint-disable-next-line
j.ver = j.fs.read_e(__dirname+'/version').replace(/\n/gu, '');
j.files = {};
j.files.bundle = `bundle.${j.ver.replace(/\./gu, '_')}.min.js`;
j.files.argv_json = pa.root_bin+'/argv.json';
// XXX: support running without xcred.js
j.files.xcred = j.is_ext ? pa.bin : home_path+'/.xcred.js';
if (process.env.XCRED && !fs.existsSync(j.files.xcred))
  fs.writeFileSync(j.files.xcred, process.env.xCRED);
j.files.config_js = pa.bin+'/config.js';
j.files.config_json = pa.bin+'/config.json';
const config_js_get = ()=>{
  return {};
};
const config_int_js_get = ()=>{
  // eslint-disable-next-line
  const server = require('./src/system/env/server.js');
  // eslint-disable-next-line
  const config_int = require('./src/system/env/config.js');
  let config = config_js_get();
  let o = config;
  return o;
};
j.file(j.files.config_js, [j.files.argv_json], ()=>{
  fs.writeFileSync(j.files.config_js, '// LICENSE_CODE MIT\n// eslint-disable\n'
    +'module.exports = '
    +j.j2s(config_js_get()));
});
j.file(j.files.config_json, [j.files.config_js], ()=>{
  fs.writeFileSync(j.files.config_json, j.j2s(config_js_get()));
});
j.files.config_int_js = pa.bin+'/config_int.js';
j.file(j.files.config_int_js, [j.files.argv_json,
  pa.src+'/src/system/env/config.js'], ()=>{
  fs.writeFileSync(j.files.config_int_js,
    '// LICENSE_CODE MIT\n// eslint-disable\nmodule.exports = '
    +j.j2s(config_int_js_get()));
});
j.files.config_int_json = pa.bin+'/config_int.json';
j.file(j.files.config_int_json, [j.files.config_int_js], ()=>{
  fs.writeFileSync(j.files.config_int_json, j.j2s(config_int_js_get()));
});
let host_init = j.task_phony('host_init', [pa.src+'/package.json'], ()=>{
  detect_env();
}, {pa});
j.files.config_phony =
  j.task_phony('config', [host_init, pa.src+'/package.json'], ()=>{
    j.npm(undefined, {path: pa.src});
  }, {pa});
j.files.sls_env = j.task_phony('sls_env', [j.files.xcred, j.files.argv_json],
  ()=>{
    // XXX: move into aws_env task
    let aws_path = home_path+'/.aws';
    j.mkdir_p(aws_path);
    let f = aws_path+'/credentials';
    let f_exist = fs.existsSync(f);
    let s = '';
    // XXX: append to file and search for creds
    for (let __user in users)
    {
      let _user = users[__user];
      s += `[${__user}]\n`
        +`aws_access_key_id = ${_user.aws.key_id}\n`
        +`aws_secret_access_key = ${_user.aws.key_secret}\n`
        +`region = ${_user.aws.region}\n`;
    }
    let f_out;
    if (f_exist)
      f_out = j.fs.read_e(f);
    if (f_exist && !f_out.includes(s))
    {
      fail(`${f} different than expect file:\n${f_out}\nexpected:\n${s}\n`
        +`to resolve you can remove cred file and running again:\nrm ${f}`);
    }
    if (s&&!f_exist)
      fs.writeFileSync(f, s);
    console.log('sls_env OK');
  }, {pa});

j.subdir(__dirname, 'src');
j.task('clean', [], ()=>{
  // XXX: sudo needed due to nodock mysql db file no permission
  j.spawn(`${j.su=='xsu' ? j.su : ''} rm -rf ${pa.bin}`, __dirname, true);
  for (let i=0; i<npm_i_predirs.length; i++)
  {
    let dir = npm_i_predirs[i];
    jake.rmRf(dir+'/yarn.lock');
    jake.rmRf(dir+'/node_modules');
  }
}, {desc: true});
if (j.is_argv_changed)
  fs.writeFileSync(j.files.argv_json, JSON.stringify(j.argv));
j.task('default', [j.files.config_phony]);
const user_local_get = ()=>{
  return {aws: {
    key_id: 'key_id_local',
    key_secret: 'key_secret_local',
    region: 'us-east-1',
    bucket: 'x-cred-local',
    stage: [{id: 'local'}],
  }};
};

const xcred_init = opt=>{
  let xcred_user = j.opt.user||(j.is_prod ? 'prod' : j.is_local ? 'local'
    : user_id);
  j.rxcred_user = xcred_user;
  j.opt.stage = j.opt.stage||(j.is_prod ? 'prod'
    : j.is_local ? 'local' : 'dev');
  opt = opt||{};
  let xcred = j.require_optional(j.files.xcred);
  if (!xcred)
    users = {local: user_local_get()};
  else
    users = xcred.users;
  if (!xcred && !j.is_local && !is_host)
  {
    console.log('// LICENSE_CODE MIT');
    console.log("'use strict'");
    console.log('');
    console.log('let E = module.exports;');
    console.log('');
    console.log('E.users = {');
    console.log('  prod: {');
    console.log('    // add here info for prod builds');
    console.log('  },');
    console.log('  george: {');
    console.log('    aws: {');
    console.log("      key_id: 'AKXXXXXXXXXXXXXXXXXX',");
    console.log("      key_secret: 'eU7XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',"
    );
    console.log("      region: 'us-east-1',"),
    console.log('      stage: [{');
    console.log("        id: 'dev',");
    console.log('      }],');
    console.log('    },');
    console.log('  },');
    console.log('};');
    fail('missing ~/.xcred.js must create file, example above');
  }
  users.local = user_local_get();
  user = users[xcred_user];
  if (!j.is_local && !user && !is_install)
    fail(`user ${user_id} missing from config`);
  if (user)
    j.opt.aws_info = user.aws;
};
xcred_init();
j.task('aws_init', [j.files.config_phony, j.files.xcred, j.files.argv_json],
  ()=>{
    // XXX: move aws_init.py to js here
    j.spawn_e(['./src/back/script/aws_init.py', '--aws_key',
      user.aws.key_secret, '--aws_key_id', user.aws.key_id, '--region',
      user.aws.region, '--bucket_name', user.aws.bucket], __dirname, true);
  });

j.task('git_config', [], ()=>{
  let s = j.fs.read(`${process.env.HOME}/.gitconfig`)||'';
  let arr = [{k: 'diff.tool', v: 'gvimdiff'},
    {k: 'difftool.prompt', v: 'false'},
    {k: 'alias.d', v: 'difftool'},
    {k: 'credential.helper', v: 'store'},
    {k: 'user.name', v: user_id},
    // eslint-disable-next-line no-useless-escape
    {k: 'user.email', v: `${user_id}\@gmail.com`},
    {k: 'merge.tool', v: 'gvimdiff'},
    {k: 'merge.conflictstyle', v: 'diff3'},
    {k: 'mergetool.prompt', v: false},
    {k: 'core.editor', v: 'gvim -f'}];
  for (let i=0; i<arr.length; i++)
  {
    let k = arr[i].k, v = arr[i].v;
    let path = k.split('.');
    if (s.includes(path[1]+' = '+v) && s.includes(`[${path[0]}]`))
      continue;
    if (s!='')
    {
      // XXX: wrap fail and use console.error first
      console.error(`~/.gitconfig missing ${k} ${v} run\n`
	+`$ git config --global ${k} "${v}"`);
      fail();
    }
    j.spawn_e(['git', 'config', '--global', k, `"${v}"`], __dirname,
      undefined, true);
  }
});

j.task('lint_python_fix', [], ()=>{
  j.spawn_e(['yapf', '-ir', pa.src+'/src'], __dirname, true, true);
}, {desc: true});

// XXX: add script for linting any file which chooses linter
j.task('lint_python', [], ()=>{
  let is_flake8;
  if (is_flake8)
    return void j.spawn_e(['flake8'], __dirname, true, true);
  j.spawn_e(['yapf', '-rdp', pa.src+'/src'], __dirname, true, true);
}, {desc: true});

t_cb&&t_cb();
j.uninit(true);
jake.run(...args);

