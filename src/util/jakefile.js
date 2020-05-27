// LICENSE_CODE MIT
'use strict';
const j = require('../../jake/util.js');

j.subdir();
let pa = j.path_all(__dirname);
let pkg = ['events.js', 'sql.js', 'package.json', 'eserf.js', 'str.js',
  'ereq.js', 'xurl.js', 'proc.js', 'date.js', 'xtest.js'];
if (!j.is_ext)
  pkg.push('array.js', 'util.js');
j.dep(pa.src, pa.bin, 'util.dep', pkg);
j.ln2bin(pa.src, ['test.js']);
j.task('test_util', [pa.bin+'/util.dep', pa.bin+'/test.js'], ()=>{
  j.test_run(pa.bin);
}, {desc: true});
j.task('test', ['test_util']);
