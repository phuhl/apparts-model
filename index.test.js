const { setup, teardown } = require("./tests/database");
const { useModel } = require("./index.js");
const { NotUnique, NotFound, DoesExist } = require("./errors");

const SETUPDB = `
CREATE TABLE users (
  _id SERIAL PRIMARY KEY,
  test INT NOT NULL,
  a INT
);

CREATE TABLE users2 (
  _id SERIAL NOT NULL,
  test INT NOT NULL,
  a INT,
  PRIMARY KEY (_id, test)
);`;

const type = {
  _id: { type: "id", key: true },
  test: { type: "int" },
  a: { type: "int", optional: true },
};
const multiKeyType = {
  _id: { type: "id", key: true },
  test: { type: "int", key: true },
  a: { type: "int", optional: true },
};
const useUser = (dbs) => useModel(dbs, type, "users");
const useUser2 = (dbs) => useModel(dbs, multiKeyType, "users2");

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmodeltests");
});
afterAll(async () => {
  await teardown();
});

describe("OneModel", () => {
  test("creation of one", async () => {
    const [, Model] = useUser(dbs);

    let m = new Model({ test: 1 });
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.content).toMatchObject({ test: 1, _id: 1 });
  });

  test("creation of many", async () => {
    const [, Model] = useUser(dbs);
    await expect(() => new Model([{ test: 1 }, { test: 2 }])).toThrow({
      message: "[OneModel] cannot create multiple. Use ManyModel instead!",
    });
  });

  test("loadOne success", async () => {
    const [, Model] = useUser(dbs);
    const m = new Model();

    await expect(m.load({ test: 1 })).resolves.toBe(m);
    expect(m.content).toMatchObject({ test: 1, _id: 1 });
  });

  test("loadOne fail (too many)", async () => {
    const [, Model] = useUser(dbs);

    await new Model({ test: 1, a: 2 }).store();

    const m = new Model();
    await expect(m.load({ test: 1 })).rejects.toMatchObject({
      message: "[Model] Object not unique",
    });
  });

  test("loadOne fail (too few)", async () => {
    const [, Model] = useUser(dbs);

    const m = new Model();
    await expect(m.load({ test: 8 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("update", async () => {
    const [, Model] = useUser(dbs);

    const m = new Model();

    await new Model({ test: 4, a: 1 }).store();
    await m.load({ test: 4 });
    m.content.a = 2;
    await m.update();
    const m2 = await new Model().load({ test: 4 });

    expect(m2.content).toMatchObject({
      test: 4,
      a: 2,
    });
  });

  test("delete", async () => {
    const [, Model] = useUser(dbs);
    await new Model({ test: 5 }).store();
    await (await new Model().load({ test: 5 })).delete();

    await expect(new Model().load({ test: 5 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("loadById, one key", async () => {
    const [, Model] = useUser(dbs);
    const m1 = await new Model({ test: 1 }).store();
    await new Model({ test: 2 }).store();
    const m2 = await new Model().loadById(m1.content._id);

    expect(m2.content.test).toBe(1);
    expect(m2.content._id).toBe(m1.content._id);
  });

  test("[Model] loadById, multi key", async () => {
    const [, Model] = useUser2(dbs);

    const m1 = await new Model({ test: 1, a: 7 }).store();
    const m3 = await new Model({ test: 1 }).store();
    await new Model({ test: 2 }).store();
    const m2 = await new Model().loadById({ _id: m1.content._id, test: 1 });

    expect(m2.content).toMatchObject({
      a: 7,
      _id: m1.content._id,
      test: 1,
    });
    await expect(new Model().loadById(m1.content._id)).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["_id","test"]", Id: "${m1.content._id}"`,
    });
    await expect(new Model().loadById({ _id: m1.content._id })).rejects.toThrow(
      {
        message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["_id","test"]", Id: "{"_id":${m1.content._id}}"`,
      }
    );
  });
});

describe("ManyModel", () => {
  test("creation of one", async () => {
    const [Models] = useUser(dbs);
    await expect(() => new Models({ test: 1 })).toThrow({
      message: "[ManyModel], contents should be an array",
    });
  });

  test("creation of many", async () => {
    const [Models] = useUser(dbs);
    const m = new Models([{ test: 1 }, { test: 2 }]);
    await expect(m.store()).resolves.toBe(m);
    const [{ _id: id1 }, { _id: id2 }] = m.contents;
    expect(m.contents).toMatchObject([
      { test: 1, _id: id1 },
      { test: 2, _id: id2 },
    ]);
  });

  test("update", async () => {
    const [Models, Model] = useUser(dbs);

    const ms = new Models();

    const { _id: id1 } = (await new Model({ test: 10, a: 4 }).store()).content;
    const [{ _id: id2 }, { _id: id3 }] = (
      await new Models([
        { test: 11, a: 4 },
        { test: 12, a: 4 },
      ]).store()
    ).contents;
    await ms.load({ a: 4 });
    ms.contents.forEach((c) => (c.a = 999));
    await ms.update();
    const newms = await new Models().load({ a: 999 });

    expect(newms.contents).toMatchObject([
      { test: 10, a: 999, _id: id1 },
      { test: 11, a: 999, _id: id2 },
      { test: 12, a: 999, _id: id3 },
    ]);
  });

  test("deleteAll", async () => {
    const [Models] = useUser(dbs);
    await new Models([
      { test: 1, a: 1 },
      { test: 1, a: 2 },
    ]).store();

    await (await new Models().load({ test: 1 })).deleteAll();
    const newms = await new Models().load({ test: 1 });

    expect(newms.contents.length).toBe(0);
  });

  test("loadByIds, one key", async () => {
    const [Models] = useUser(dbs);
    const [{ _id: id1 }, { _id: id2 }, { _id: id3 }] = (
      await new Models([
        { test: 99, a: 1 },
        { test: 100, a: 2 },
        { test: 101, a: 3 },
      ]).store()
    ).contents;

    const ms = await new Models().loadByIds({ _id: [id1, id2, id3] });
    const ms2 = await new Models().loadByIds([id1, id2, id3]);
    const result = [
      {
        test: 99,
        a: 1,
        _id: id1,
      },
      {
        test: 100,
        a: 2,
        _id: id2,
      },
      {
        test: 101,
        a: 3,
        _id: id3,
      },
    ];
    expect(ms.contents).toMatchObject(result);
    expect(ms2.contents).toMatchObject(result);
  });

  test("loadByIds, multi key", async () => {
    const [Models, Model] = useUser2(dbs);

    const m1 = await new Model({ test: 1, a: 7 }).store();
    const m3 = await new Model({ test: 1 }).store();

    const mres = await new Models().loadByIds({
      _id: [m1.content._id, m3.content._id],
      test: 1,
    });

    expect(mres.contents.length).toBe(2);
    expect(mres.contents).toMatchObject([
      {
        test: 1,
        _id: m1.content._id,
        a: 7,
      },
      {
        test: 1,
        _id: m3.content._id,
      },
    ]);
    await expect(new Models().loadByIds([m1.content._id])).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["_id","test"]", Id: "[${m1.content._id}]"`,
    });
    await expect(
      new Models().loadByIds({ _id: [m1.content._id] })
    ).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["_id","test"]", Id: "{"_id":[${m1.content._id}]}"`,
    });
  });
});

describe("NoneModel", () => {
  test("loadOne success", async () => {
    const [, , NoModel] = useUser(dbs);

    const m = new NoModel();

    await expect(m.loadNone({ test: 777 })).resolves.toBe(m);
  });

  test("loadOne fail (too many)", async () => {
    const [, Model, NoModel] = useUser(dbs);

    await new Model({ test: 777 }).store();

    const m = new NoModel();
    await expect(m.loadNone({ test: 777 })).rejects.toMatchObject({
      message: "[Model] Object does exist",
    });
  });
});
