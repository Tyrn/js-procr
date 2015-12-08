var assert = require('assert');

var pcn = require('../procr/pcn');
var helper = pcn.helper;

describe('helper', function() {
  describe('#sansExt()', function () {
    it('should return a path short of file extension', function () {
      assert.equal('/alfa/bra.vo/masha', helper.sansExt('/alfa/bra.vo/masha.txt'));
    });
  });
});
