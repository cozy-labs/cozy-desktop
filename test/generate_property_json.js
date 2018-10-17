#!/usr/bin/env node

const faker = require('faker')

let knownPaths = []

function newPath () {
  let p = faker.system.fileName()
  knownPaths.push(p)
  return p
}

function knownPath () {
  if (knownPaths.length === 0) {
    return newPath()
  }
  return faker.random.arrayElement(knownPaths)
}

function createNewDir () {
  return { op: 'mkdir', path: newPath() }
}

function createNewFile () {
  return { op: 'create_file', path: newPath() }
}

function rm () {
  return { op: 'rm', path: knownPath() }
}

function sleep () {
  const s = 2 ** (1 + faker.random.number(3))
  return { op: 'sleep', duration: 1000 * s }
}

function freq (choices) {
  const ary = []
  for (let choice of choices) {
    for (let i = 0; i < choice[0]; i++) {
      ary.push(choice[1])
    }
  }
  const fn = faker.random.arrayElement(ary)
  return fn()
}

function init (ops) {
  const n = faker.random.number(64)
  for (let i = 0; i < n; i++) {
    const op = freq([
      [1, createNewDir],
      [1, createNewFile]
    ])
    ops.push(op)
  }
}

function start (ops) {
  ops.push({ op: 'start' })
}

function run (ops) {
  const n = faker.random.number(256)
  for (let i = 0; i < n; i++) {
    const op = freq([
      [3, createNewDir],
      [3, createNewFile],
      [5, rm],
      [1, sleep]
    ])
    ops.push(op)
  }
}

function generate (filename) {
  let ops = []
  init(ops)
  start(ops)
  run(ops)
  console.log(JSON.stringify(ops))
}

// TODO seed
generate()
