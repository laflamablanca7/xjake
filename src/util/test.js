// LICENSE_CODE MIT
'use strict';
const assert = require('assert').strict;
const {describe, it, afterEach} = require('mocha');
const Server_mock = require('mock-http-server');
const eserf = require('./eserf.js');
const str = require('./str.js');
const ereq = require('./ereq.js');
const xurl = require('./xurl.js');

// XXX: move into xtest.js
const xtest = {buf: [], console: {
  log: (...args)=>{
    xtest.buf.push(...args);
  }, error: (...args)=>{
    xtest.buf.push(...args);
  }
}};

xtest.console_prev = {log: console.log, error: console.error};
//console = xtest.console;

let orders = {};
const step = (id, order, delta_ms)=>{
  let now = new Date();
  if (!orders[id])
  {
    orders[id] = {prev: 0, prev_ts: new Date()};
    return;
  }
  let _order = orders[id];
  assert.equal(_order.prev+1, order);
  if (delta_ms!=undefined)
  {
    let delta_ms_curr = now-_order.prev_ts;
    assert.equal(delta_ms>delta_ms_curr-15 || delta_ms<delta_ms_curr+15, true);
  }
  _order.prev++;
  _order.prev_ts = now;
};

const step_uninit = (id, order, delta_ms)=>{
  step(id, order, delta_ms);
  delete orders[id];
};

const eserf_test = ()=>{
  it('basic', ()=>{
    return eserf({cancel: true, name: 'basic'}, [function(){}]);
  });
  it('sleep', ()=>{
    return eserf({cancel: true, name: 'sleep'}, [function(){
      step('sleep', 0);
      return eserf.sleep(50);
    }, function(){
      step_uninit('sleep', 1);
    }]);
  });
  it('wait_child', ()=>{
    step('wait_child', 0, 0);
    return eserf({cancel: true, name: 'sleep'}, [function(){
      let sps = [];
      step('wait_child', 1, 0);
      for (let i=0; i<3; i++)
      {
        sps.push(eserf(function* _sleep(){
          yield eserf.sleep(i*10);
        }));
      }
      return this.wait_child('all');
    }, function(){
      step_uninit('wait_child', 2, 30);
    }]);
  });
  it('await', ()=>{
    step('await', 0);
    return eserf({cancel: true, name: 'await'}, [function(){
      step('await', 1);
      return eserf(async function(){
        await new Promise(resolve=>setTimeout(resolve, 50));
      });
    }, function(){
      step_uninit('await', 2, 50);
    }]);
  });
  it('cancel', ()=>{
    step('cancel', 0);
    let cancelled;
    return eserf({cancel: true, name: 'cancel'}, [function(){
      step('cancel', 1);
      setTimeout(()=>{
        assert.equal(cancelled, true);
        step_uninit('cancel', 3);
      }, 50);
    }, function(){
      this._ecancel();
    }, function(){
      assert('failed');
    }, ['finally$', function(){
      cancelled = true;
      step('cancel', 2);
    }]]);
  });
  it('wait_ret_gen', ()=>{
    step('wait_ret_gen', 0);
    return eserf(function*(){
      this.finally(()=>{
        step_uninit('wait_ret_gen', 7);
      });
      step('wait_ret_gen', 1);
      let ess = [];
      ess.push(eserf(function*(){
        step('wait_ret_gen', 2);
        yield eserf.sleep(10);
        step('wait_ret_gen', 4);
        return {hello: 'world'};
      }));
      ess.push(eserf(function*(){
        step('wait_ret_gen', 3);
        yield eserf.sleep(50);
        step('wait_ret_gen', 5);
        return {hello: 'world'};
      }));
      let ess_ret = yield this.wait_ret(ess);
      step('wait_ret_gen', 6);
      assert.deepEqual(ess_ret[0], {hello: 'world'});
      assert.deepEqual(ess_ret[1], {hello: 'world'});
    });
  });
  it('parellel_res', ()=>{
    step('parellel_res', 0);
    return eserf({cancel: true, name: 'parellel_res'}, [function(){
      step('parellel_res', 1);
      let ess = [];
      ess.push(eserf(function*(){
        step('parellel_res', 2);
        yield eserf.sleep(10);
        step('parellel_res', 4);
        return {hello: 'world'};
      }));
      ess.push(eserf(function*(){
        step('parellel_res', 3);
        yield eserf.sleep(50);
        step('parellel_res', 5);
        return {hello: 'world'};
      }));
      return this.wait_ret(ess);
    }, function(ess_ret){
      step('parellel_res', 6);
      assert.deepEqual(ess_ret[0], {hello: 'world'});
      assert.deepEqual(ess_ret[1], {hello: 'world'});
    }, ['finally$', function(){
      step_uninit('parellel_res', 7);
    }]]);
  });
  it('parellel_res_misordered', ()=>{
    step('parellel_res_misordered', 0);
    return eserf({cancel: true, name: 'parellel_res_misordered'}, [function(){
      step('parellel_res_misordered', 1);
      let ess = [];
      ess.push(eserf(function*(){
        step('parellel_res_misordered', 2);
        yield eserf.sleep(50);
        step('parellel_res_misordered', 5);
        return {hello: 'world 1'};
      }));
      ess.push(eserf(function*(){
        step('parellel_res_misordered', 3);
        yield eserf.sleep(10);
        step('parellel_res_misordered', 4);
        return {hello: 'world 2'};
      }));
      return this.wait_ret(ess);
    }, function(ess_ret){
      step('parellel_res_misordered', 6);
      assert.deepEqual(ess_ret[0], {hello: 'world 1'});
      assert.deepEqual(ess_ret[1], {hello: 'world 2'});
    }, ['finally$', function(){
      step_uninit('parellel_res_misordered', 7);
    }]]);
  });
  it('alarm', ()=>{
    step('alarm', 0);
    return eserf(function* alarm(){
      this.alarm(10, ()=>{
        step('alarm', 1);
      });
      yield eserf.sleep(50);
      step('alarm', 2);
      step_uninit('alarm', 3);
    });
  });
  it('alarm_cancel_on_return', ()=>{
    step('alarm_cancel_on_return', 0);
    return eserf(function* alarm_cancel_on_return(){
      this.alarm(50, ()=>{
        assert('invalid should have been cancelled');
      });
      step('alarm_cancel_on_return', 1);
      yield eserf.sleep(10);
      step('alarm_cancel_on_return', 2);
      step_uninit('alarm_cancel_on_return', 3);
    });
  });
  it('wait_timeout', ()=>{
    step('wait_timeout', 0);
    return eserf(function* wait_timeout(){
      let res, err;
      try { res = yield this.wait(50); } catch(_err) { err = _err; }
      assert.deepEqual('timeout', err);
      assert.deepEqual(res, undefined);
      step_uninit('wait_timeout', 1, 50);
    });
  });
  it('wait_timeout_continue', ()=>{
    step('wait_timeout_continue', 0);
    return eserf(function* wait_timeout_continue(){
      this.alarm(10, ()=>{
        this.continue();
      });
      yield this.wait(50);
      step_uninit('wait_timeout_continue', 1, 10);
    });
  });
  it('continue_cb_now', ()=>{
    step('continue_cb_now', 0);
    return eserf(function* continue_cb_now(){
      this.finally(()=>{
        step_uninit('continue_cb_now', 3);
      });
      let continue_now = ()=>{
        this.continue({a: 1});
        step('continue_cb_now', 1);
      };
      continue_now();
      step('continue_cb_now', 2);
      let res = yield this.wait();
      assert.deepEqual(res, {a: 1});
    });
  });
  it('yield_eserf', ()=>{
    step('yield_eserf', 0);
    return eserf(function* _yield_eserf(){
      this.finally(()=>{
        step_uninit('yield_eserf', 3);
      });
      let yield_eserf = function(){
        return eserf(function*(){
          yield eserf.sleep(10);
          step('yield_eserf', 1);
          return {a: 1};
        });
      };
      let res = yield yield_eserf();
      step('yield_eserf', 2);
      assert.deepEqual(res, {a: 1});
    });
  });
};

const str_test = ()=>{
  it('trim', ()=>{
    assert.equal(str.trim('xxx\n   bbb \r\n   ccc'), 'xxx bbb ccc');
  });
  it('trimh', ()=>{
    assert.equal(str.trimh('xxx\n   b  bb \r\n   ccc'), 'xxx\nb  bb\nccc\n');
  });
  it('s2a', ()=>{
    assert.deepEqual(str.s2a('xxx\n   bbb \r\n   ccc'), ['xxx', 'bbb', 'ccc']);
  });
  it('j2s', ()=>{
    assert.equal(str.j2s({a: 1, b: 2}), '{\n  "a": 1,\n  "b": 2\n}');
  });
};

const ereq_test = function(){
  let server = new Server_mock({host: '127.0.0.1', port: 7210});
  this.beforeEach(function(done){
    server.start(done);
  });
  this.afterEach(function(done){
    server.stop(done);
  });
  const server_resp = (status, resp)=>{
    server.on({
      method: 'GET',
      path: '/resource',
      reply: {
        status: status,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(resp)
      }
    });
  };
  it('ereq_basic', ()=>eserf(function* ereq_basic(){
    server_resp(200, {hello: 'world'});
    let res = yield ereq.get('http://127.0.0.1:7210/resource');
    assert.deepEqual(res.data, {hello: 'world'});
    assert.equal(res.err, undefined);
    assert.deepEqual(res.status, 200);
  }));
  it('ereq_fail', ()=>eserf(function* _ereq_fail(){
    server_resp(500);
    let res = yield ereq.get('http://127.0.0.1:7210/resource');
    assert.ok((/failed/u).test(res.err));
    assert.deepEqual(res.status, 500);
  }));
};

const xurl_test = function(){
  it('xurl_basic', ()=>{
    let url = xurl.url('example.com', {a: 1, b: 2}, {x: 1, y: 2});
    assert.deepEqual('example.com?a=1&b=2#x=1&y=2', url);
  });
  it('xurl_basic_qs_undefined', ()=>{
    let url = xurl.url('example.com', {a: undefined});
    assert.deepEqual('example.com?a=', url);
  });
  it('xurl_basic_qs_null', ()=>{
    let url = xurl.url('example.com', {a: null});
    assert.deepEqual('example.com?a=', url);
  });
  it('xurl_qs_parse', ()=>{
    let qs_parsed = xurl.qs_parse('?a=1&b=2');
    assert.deepEqual({a: 1, b: 2}, qs_parsed);
  });
  it('xurl_qs_parse_equal_undefined', ()=>{
    let qs_parsed = xurl.qs_parse('?a=');
    assert.deepEqual({a: undefined}, qs_parsed);
  });
  it('xurl_qs_parse_no_equal_undefined', ()=>{
    let qs_parsed = xurl.qs_parse('?a');
    assert.deepEqual({a: true}, qs_parsed);
  });
};

const init = ()=>{
  process.on('exit', ()=>{
    eserf.shutdown();
  });
  // eslint-disable-next-line mocha/no-top-level-hooks
  afterEach(function(){
    //let test_id = this.currentTest.parent.title+' '+this.currentTest.title;
    if (this.currentTest.state!='failed')
      return;
    xtest.console_prev.error(xtest.buf);
  });
  describe('eserf', eserf_test);
  describe('str', str_test);
  describe('ereq', ereq_test);
  describe('xurl', xurl_test);
};

init();
