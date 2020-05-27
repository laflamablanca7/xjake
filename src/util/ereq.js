// LICENSE_CODE MIT
const assert = require('assert');
const axios = require('axios');
const eserf = require('./eserf.js');
const xurl = require('./xurl.js');

let E = module.exports;
let is_node = process&&process.title!='browser';
E.is_verbose = is_node;
E.fd_count = 0;

E.auth_hdr = token=>{ return {Authorization: `Bearer ${token}`}; };
E.auth_hdr_vnd = token=>{
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/vnd.api+json',
  };
};

let ess = [];
E.default = (method, url, config)=>{
  const cancel_token = axios.CancelToken;
  const source = cancel_token.source();
  let is_running;
  return eserf(function* _req(){
    E.fd_count++;
    this.finally(()=>{
      E.fd_count--;
      if (is_running)
        source.cancel('ereq cancelled');
      if (!ess.length)
        return;
      let es = ess.pop();
      es.continue();
    });
    if (E.fd_limit && E.fd_count>=E.fd_limit)
    {
      let es = this.wait();
      ess.push(es);
      yield es;
    }
    is_running = true;
    config = config||{};
    let qs = config.qs;
    let hs = config.hs;
    if (qs || hs)
      url = xurl.url(url, qs, hs);
    config = Object.assign(config, {url, method, cancelToken: source.token});
    let normilize_hdr;
    if (normilize_hdr)
    {
      let _headers = {};
      for (let h in config.headers)
        _headers[h.toLowerCase()] = config.headers[h];
      if (config.data && !_headers['content-type'])
        config.headers['Content-Type'] = 'application/json';
    }
    let res, _err;
    res = yield this.wait_ext(axios(config).catch(function(err){
      _err = err;
    }));
    is_running = false;
    if (_err)
    {
      if (_err.errno=='EMFILE')
        assert(0, `EMFILE to many open fds ${E.fd_count}`);
      let msg = 'ereq failed '+url+' '+_err.message;
      if (!config.no_print)
        console.error(msg, config, _err.stack, this.ps());
      let status = _err.response&&_err.response.status;
      let status_txt = _err.response&&_err.response.statusText;
      let err_data = _err&&_err.response&&_err.response.data;
      return {err: msg, status, status_txt, err_data};
    }
    if (E.is_verbose)
    {
      console.log('ereq', config.method, config.url, config.headers||'',
        res.data);
    }
    return res;
  });
};

E.get = (url, config)=>E.default('GET', url, config);
E.patch = (url, config)=>E.default('PATCH', url, config);
E.post = (url, config)=>E.default('POST', url, config);
E.put = (url, config)=>E.default('PUT', url, config);
E.delete = (url, config)=>E.default('DELETE', url, config);
