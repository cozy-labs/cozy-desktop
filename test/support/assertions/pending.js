const should = require('should')

should.Assertion.add('pending', function () {
  this.params = {operator: 'be pending'}
  this.obj.isPending().should.be.true()
})
