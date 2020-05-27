// LICENSE_CODE MIT
let E = module.exports;

// XXX: add support for relative paths
E.require_optional = mod=>{
  let ret;
  // eslint-disable-next-line global-require
  try { ret = require(mod); } catch(e) {}
  return ret;
};
