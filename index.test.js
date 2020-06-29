const helpers = require('../util/testhelpers.js');


let Model;
let Dbs;
let mycolprefix;
let createCol;

let type = {_id: { type: 'id', key: true }};

beforeAll(helpers.beforeAll((dbs, colprefix) => {
  let _model = require('./index.js');
  _model._setColPrefix(colprefix);
  Model = _model(dbs);
  Dbs = dbs;
  mycolprefix = colprefix;
}));
afterAll(helpers.afterAll);


beforeEach(helpers.beforeEach(true, (_createCol) => {
  createCol = _createCol;
  return createCol(new Model({
    _id: { type: 'id', key: true},
    test: { type: 'int' },
    a: { type: 'int', optional: true }
  }, "test", {}));
}));
afterEach(helpers.afterEach());


test('[Model] creation', () => {
  let m = new Model(type, "test", { test: 1 });
  expect.assertions(1);
  return expect(m.store()).resolves.toBe(m);
});

test('[Model] loadOne success', () => {
  let m = new Model(type, "test");
  let as = [ () => new Model(type, "test", { test: 1 }).store(),
             () => m.loadOne({test: 1})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toBe(m);
});

test('[Model] loadOne fail (too many)', () => {
  let m = new Model(type, "test");
  let as = [ () => new Model(type, "test", { test: 1, a: 1 }).store(),
             () => new Model(type, "test", { test: 1, a: 2 }).store(),
             () => m.loadOne({test: 1})
           ];

  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).rejects.toHaveProperty("id", "E4");
});

test('[Model] loadOne fail (too few)', () => {
  let m = new Model(type, "test");
  let as = [ () => m.loadOne({test: 1})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).rejects.toHaveProperty("id", "E25");
});


test('[Model] update', () => {
  let m = new Model(type, "test");
  let as = [ () => new Model(type, "test", {test: 1, a: 1}).store(),
             () => m.loadOne({test: 1}),
             () => {m.contents[0].a = 2; return Promise.resolve();},
             () => m.update(),
             () => new Model(type, "test").loadOne({test: 1})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toMatchObject(
    { contents : [{test: 1, a: 2}]});
});

test('[Model] update multiple', () => {
  let m = new Model(type, "test");
  let as = [ () => new Model(type, "test", {test: 1, a: 1}).store(),
             () => new Model(type, "test", {test: 2, a: 1}).store(),
             () => new Model(type, "test", {test: 3, a: 1}).store(),
             () => m.load({a: 1}),
             () => {m.contents.forEach(c => c.a = 2);
                    return Promise.resolve();},
             () => m.update(),
             () => new Model(type, "test").load({a: 2})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toMatchObject(
    { contents : [{test: 1, a: 2}, {test: 2, a: 2}, {test: 3, a: 2}]});
});

test('[Model] delete', () => {
  let m = new Model(type, "test", {test: 1, a: 1});
  let as = [ () => m.store(),
             () => m.delete(),
             () => new Promise(res => setTimeout(() => res(), 0)),
             () => new Model(type, "test").load({test: 1})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toMatchObject(
    { contents : []});
});

test('[Model] deleteAll', () => {
  let m = new Model(type, "test", [{test: 1, a: 1},
                                                     {test: 1, a: 2}]);
  let as = [ () => m.store(),
             () => m.deleteAll(),
             () => new Promise(res => setTimeout(() => res(), 0)),
             () => new Model(type, "test").load({test: 1})
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toMatchObject(
    { contents : []});
});

test('[Model] storeUnique', () => {
  let as = [ () => createCol(new Model({
    _id: { type: 'id', key: true},
    test: { type: 'int', unique: true },
    a: { type: 'int' }
  }, "test1", {})),
             () => new Model(type, "test1", {test: 1, a: 1}).storeUnique(),
             () => new Model(type, "test1", {test: 1, a: 2}).storeUnique()
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).rejects.toBeUndefined();
});

test('[Model] loadById, one key', () => {
  let m1 = new Model(type, "test", {test: 1});
  let m2 = new Model(type, "test");
  let as = [ () => m1.store(),
             () => new Model(type, "test", {test: 2}).store(),
             () => m2.loadById(m1.contents[0]._id),
             () => {
               if(m2.contents.length === 1 && m2.contents[0].test === 1
                 && m2.contents[0]._id === m1.contents[0]._id){
                 return Promise.resolve();
               }
               return Promise.reject('not loaded correctly by id');
             }
           ];
  expect.assertions(1);
  return expect(helpers.resolveSeq(as)).resolves.toBeUndefined();
});

test('[Model] loadById(s), multi key', () => {
  let myType = {_id: { type: 'id', key: true },
                test: { type: 'int', key: true },
                a: { type: 'int', optional: true }};
  let m1 = new Model(myType, "test2", {test: 1, a: 7});
  let m2 = new Model(myType, "test2");
  let m3 = new Model(myType, "test2", {test: 1});
  let m4 = new Model(myType, "test2");
  let as = [ () => createCol(new Model(myType, "test2", {})),
             () => m1.store(),
             () => m3.store(),
             () => new Model(myType, "test2", {test: 2}).store(),
             () => m2.loadById({ _id: m1.contents[0]._id, test: 1}),
             () => {
               if(m2.contents.length === 1 && m2.contents[0].test === 1
                  && m2.contents[0]._id === m1.contents[0]._id
                  && m2.contents[0].a === 7){
                 return Promise.resolve();
               }
               return Promise.reject('not loaded correctly by id');
             },
             () => m4.loadByIds(
               { _id: [m1.contents[0]._id, m3.contents[0]._id], test: 1}),
             () => {
               if(m4.contents.length === 2
                  && m4.contents[0].test === 1
                  && m4.contents[0]._id === m1.contents[0]._id
                  && m4.contents[0].a === 7
                  && m4.contents[1].test === 1
                  && m4.contents[1]._id === m3.contents[0]._id
                  && !m4.contents[1].a){
                 return Promise.resolve();
               }
               console.log(m4);
               return Promise.reject('not loaded correctly by id');
             },
           ];
  expect.assertions(5);
  expect(m2.loadById(m1.contents[0]._id)).rejects.toMatchObject({
    id: 'E49'
  });
  expect(m2.loadById({ _id: m1.contents[0]._id })).rejects.toMatchObject({
    id: 'E49'
  });
  expect(m2.loadByIds([m1.contents[0]._id])).rejects.toMatchObject({
    id: 'E50'
  });
  expect(m2.loadByIds({ _id: [m1.contents[0]._id] })).rejects.toMatchObject({
    id: 'E50'
  });
  return expect(helpers.resolveSeq(as)).resolves.toBeUndefined();
});
