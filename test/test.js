var assert = require('assert');

var pcn = require('../procr/pcn');
var helper = pcn.helper;

describe('helper', function() {
  describe('.sansExt(path)', function () {
    it('returns path with file extension dropped', function () {
      assert.equal('/alfa/bra.vo/masha', helper.sansExt('/alfa/bra.vo/masha.txt'));
    });
  });
});

describe('helper', function() {
  describe('.hasExtOf(path, ext)', function () {
    it('returns true, if path ends with ext', function () {
      assert.equal(true, helper.hasExtOf('/alfa/bra.vo/masha.TXT', '.txt'));
      assert.equal(true, helper.hasExtOf('/alfa/bra.vo/masha.txt', 'TxT'));
      assert.equal(true, helper.hasExtOf('/alfa/bra.vo/masha', ''));
      assert.equal(true, helper.hasExtOf('/alfa/bra.vo/masha.', '.'));
    });
  });
});
