  xdescribe('extractDirAndName', () =>
    it('returns the remote path and name', function () {
      let [path, name] = this.remote.extractDirAndName('foo')
      path.should.equal('')
      name.should.equal('foo');
      [path, name] = this.remote.extractDirAndName('foo/bar')
      path.should.equal('/foo')
      name.should.equal('bar');
      [path, name] = this.remote.extractDirAndName('foo/bar/baz')
      path.should.equal('/foo/bar')
      name.should.equal('baz')
    })
  )
