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

describe('helper', function() {
  describe('.strStripNumbers(str)', function () {
    it('returns an array of numbers embedded in str', function () {
      assert.deepEqual([13, 4, 8, 11], helper.strStripNumbers('13uk4_8pz11n'));
    });
  });
});
