#!/usr/bin/env node

const faker = require('faker')

const nbInitOps = 16
const nbRunOps = 64
const specialChars = [':', '_', 'é', ' ', '%', '\\', '&', '@', 'É', 'Ç']

let knownPaths = []
let deletedPaths = []

function similarPath() {
  let p = faker.random.arrayElement(knownPaths)
  let q = p.replace('é', '\u00E9')
  if (p != q) {
    return q
  }
  q = p.toLowerCase()
  if (p != q) {
    return q
  }
  q = p.toUpperCase()
  if (p != q) {
    return q
  }
  return p + faker.random.arrayElement(specialChars)
}

function newPath() {
  if (knownPaths.length > 0 && faker.random.number(4) === 0) {
    return similarPath()
  }
  let p = faker.system.fileName()
  if (faker.random.number(4) === 0) {
    p = faker.random.arrayElement(specialChars) + p
  }
  if (knownPaths.length > 0 && faker.random.number(3) > 0) {
    p = faker.random.arrayElement(knownPaths) + '/' + p
  }
  knownPaths.push(p)
  return p
}

function knownPath() {
  if (knownPaths.length === 0) {
    return newPath()
  }
  return faker.random.arrayElement(knownPaths)
}

function deletedPath() {
  if (deletedPaths.length === 0) {
    return newPath()
  }
  return faker.random.arrayElement(deletedPaths)
}

function fileSize() {
  return faker.random.number(32) + 2 ** (1 + faker.random.number(20))
}

function createNewDir() {
  return { op: 'mkdir', path: newPath() }
}

function createNewFile() {
  return { op: 'create_file', path: newPath(), size: fileSize() }
}

function recreateDeletedDir() {
  return { op: 'mkdir', path: deletedPath() }
}

function recreateDeletedFile() {
  return { op: 'create_file', path: deletedPath() }
}

function updateFile() {
  return { op: 'update_file', path: knownPath(), size: fileSize() }
}

function mvToNewPath() {
  let p = knownPath()
  deletedPaths.push(p)
  return { op: 'mv', from: p, to: newPath() }
}

function mvToDeletedPath() {
  let p = knownPath()
  let to = deletedPath()
  deletedPaths.push(p)
  return { op: 'mv', from: p, to: to }
}

function rm() {
  let p = knownPath()
  deletedPaths.push(p)
  return { op: 'rm', path: p }
}

function sleep() {
  const s = 2 ** (1 + faker.random.number(3))
  return { op: 'sleep', duration: 1000 * s }
}

function freq(choices) {
  const ary = []
  for (let choice of choices) {
    for (let i = 0; i < choice[0]; i++) {
      ary.push(choice[1])
    }
  }
  const fn = faker.random.arrayElement(ary)
  return fn()
}

function init(ops) {
  const n = faker.random.number(nbInitOps)
  for (let i = 0; i < n; i++) {
    const op = freq([[1, createNewDir], [1, createNewFile]])
    ops.push(op)
  }
}

function start(ops) {
  ops.push({ op: 'start' })
}

function run(ops) {
  const n = faker.random.number(nbRunOps)
  for (let i = 0; i < n; i++) {
    const op = freq([
      [5, createNewDir],
      [3, createNewFile],
      [1, recreateDeletedDir],
      [1, recreateDeletedFile],
      [1, updateFile],
      [2, mvToNewPath],
      [3, mvToDeletedPath],
      [5, rm],
      [1, sleep]
    ])
    ops.push(op)
  }
}

function generate(filename) {
  let ops = []
  init(ops)
  start(ops)
  run(ops)
  console.log(JSON.stringify(ops))
}

generate()
