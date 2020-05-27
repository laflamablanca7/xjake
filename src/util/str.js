// LICENSE_CODE MIT
let E = module.exports;
E.trim = s=>{
  return s.replace(/\s+/ug, ' ').replace(/^\s+|\s+$/u, '');
};

E.trimh = s=>{
  let ret = '';
  let lines = s.split('\n');
  for (let l of lines)
  {
    let _l = l.trim();
    if (!_l)
      continue;
    ret += _l+'\n';
  }
  return ret;
};


E.s2a = s=>E.trim(s).split(' ');
E.j2s = json=>JSON.stringify(json, null, 2);
