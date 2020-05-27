// LICENSE_CODE MIT
let E = module.exports;

E.qs = qs_o=>{
  let ret = '';
  for (let k in qs_o)
  {
    let v = qs_o[k];
    ret += '&'+k+'='+(v===undefined||v===null ? '' : encodeURIComponent(v));
  }
  return ret.substr(1);
};

E.qs_parse = qs_s=>{
  let _qs_s = qs_s.split(/[?&]/u);
  let ret = {};
  for (let k of _qs_s)
  {
    let s = k.split('=');
    if (!s.length)
      continue;
    if (s.length==1)
    {
      if (!s[0])
        continue;
      ret[s[0]] = true;
      continue;
    }
    if (s[1]=='')
    {
      ret[s[0]] = undefined;
      continue;
    }
    let _s = decodeURIComponent(s[1]);
    ret[s[0]] = isNaN(_s) ? _s : parseInt(_s, 10);
  }
  return ret;
};

E.url = (uri, qs_o, hs_o)=>{
  let ret = '';
  let qs = E.qs(qs_o);
  let hs = E.qs(hs_o);
  if (qs)
    ret += '?'+qs;
  if (hs)
    ret += '#'+hs;
  return uri+ret;
};
