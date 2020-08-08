const { setup, teardown } = require("./tests/database");
const { useModel } = require("./index.js");
const { NotUnique, NotFound, DoesExist } = require("./errors");

const SETUPDB = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  test INT NOT NULL,
  a INT
);

CREATE TABLE users2 (
  id SERIAL NOT NULL,
  test INT NOT NULL,
  a INT,
  PRIMARY KEY (id, test)
);

CREATE TABLE users3 (
  email VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  a INT,
  PRIMARY KEY (name, email)
);`;

const type = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int" },
  a: { type: "int", optional: true },
};
const multiKeyType = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int", key: true },
  a: { type: "int", optional: true },
};
const noAutoType = {
  email: { type: "email", key: true },
  name: { type: "string", key: true },
  a: { type: "int", optional: true },
};
const useUser = (dbs) => useModel(dbs, type, "users");
const useUser2 = (dbs) => useModel(dbs, multiKeyType, "users2");
const useUser3 = (dbs) => useModel(dbs, noAutoType, "users3");

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
    expect(m.content).toMatchObject({ test: 1, id: 1 });
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
    expect(m.content).toMatchObject({ test: 1, id: 1 });
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
    const m2 = await new Model().loadById(m1.content.id);

    expect(m2.content.test).toBe(1);
    expect(m2.content.id).toBe(m1.content.id);
  });

  test("loadById, multi key", async () => {
    const [, Model] = useUser2(dbs);

    const m1 = await new Model({ test: 1, a: 7 }).store();
    const m3 = await new Model({ test: 1 }).store();
    await new Model({ test: 2 }).store();
    const m2 = await new Model().loadById({ id: m1.content.id, test: 1 });

    expect(m2.content).toMatchObject({
      a: 7,
      id: m1.content.id,
      test: 1,
    });
    await expect(new Model().loadById(m1.content.id)).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "${m1.content.id}"`,
    });
    await expect(new Model().loadById({ id: m1.content.id })).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "{"id":${m1.content.id}}"`,
    });
  });

  test("insert unique, multi key, no auto", async () => {
    const [, Model] = useUser3(dbs);

    await new Model({ email: "test@test.de", name: "Peter", a: 12 }).store();
    await expect(
      new Model({ email: "test@test.de", name: "Peter" }).store()
    ).rejects.toMatchObject({ message: "[Model] Object does exist" });
  });

  test("delete, multi key, no auto", async () => {
    const [, Model] = useUser3(dbs);

    await new Model({ email: "test@test.de", name: "Franz" }).store();
    const m1 = await new Model().load({ email: "test@test.de", name: "Franz" });
    await expect(m1.delete()).resolves.toBe(m1);
    await expect(
      new Model().load({ email: "test@test.de", name: "Franz" })
    ).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
    const peter = await new Model().loadById({
      email: "test@test.de",
      name: "Peter",
    });
    expect(peter.content).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 12,
    });
  });

  test("update, multi key, no auto", async () => {
    const [, Model] = useUser3(dbs);
    await new Model({ email: "test@test.de", name: "Franz" }).store();
    const peter = await new Model().loadById({
      email: "test@test.de",
      name: "Peter",
    });
    peter.content.a = 99;
    await expect(peter.update()).resolves.toBe(peter);
    await expect(
      (
        await new Model().loadById({
          email: "test@test.de",
          name: "Peter",
        })
      ).content
    ).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 99,
    });
    await expect(
      (await new Model().loadById({ email: "test@test.de", name: "Franz" }))
        .content
    ).toMatchObject({ email: "test@test.de", name: "Franz" });
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
    const [{ id: id1 }, { id: id2 }] = m.contents;
    expect(m.contents).toMatchObject([
      { test: 1, id: id1 },
      { test: 2, id: id2 },
    ]);
  });

  test("update", async () => {
    const [Models, Model] = useUser(dbs);

    const ms = new Models();

    const { id: id1 } = (await new Model({ test: 10, a: 4 }).store()).content;
    const [{ id: id2 }, { id: id3 }] = (
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
      { test: 10, a: 999, id: id1 },
      { test: 11, a: 999, id: id2 },
      { test: 12, a: 999, id: id3 },
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
    const [{ id: id1 }, { id: id2 }, { id: id3 }] = (
      await new Models([
        { test: 99, a: 1 },
        { test: 100, a: 2 },
        { test: 101, a: 3 },
      ]).store()
    ).contents;

    const ms = await new Models().loadByIds({ id: [id1, id2, id3] });
    const ms2 = await new Models().loadByIds([id1, id2, id3]);
    const result = [
      {
        test: 99,
        a: 1,
        id: id1,
      },
      {
        test: 100,
        a: 2,
        id: id2,
      },
      {
        test: 101,
        a: 3,
        id: id3,
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
      id: [m1.content.id, m3.content.id],
      test: 1,
    });

    expect(mres.contents.length).toBe(2);
    expect(mres.contents).toMatchObject([
      {
        test: 1,
        id: m1.content.id,
        a: 7,
      },
      {
        test: 1,
        id: m3.content.id,
      },
    ]);
    await expect(new Models().loadByIds([m1.content.id])).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["id","test"]", Id: "[${m1.content.id}]"`,
    });
    await expect(
      new Models().loadByIds({ id: [m1.content.id] })
    ).rejects.toThrow({
      message: `[ManyModel] loadByIds not all keys given, E50.
Collection: "users2", Keys: "["id","test"]", Id: "{"id":[${m1.content.id}]}"`,
    });
  });

  test("insert, multi key, no auto", async () => {
    const [Models] = useUser3(dbs);

    await expect(
      new Models([
        { email: "test1@test.de", name: "Peter", a: 12 },
        { email: "test1@test.de", name: "Peter", a: 12 },
      ]).store()
    ).rejects.toMatchObject({ message: "[Model] Object not unique" });
  });

  test("delete, multi key, no auto", async () => {
    const [Models] = useUser3(dbs);

    await new Models([{ email: "test1@test.de", name: "Franz" }]).store();
    const m1 = await new Models().load({ email: "test1@test.de" });
    await expect(m1.deleteAll()).resolves.toBe(m1);
    await expect(
      (await new Models().load({ email: "test1@test.de" })).contents.length
    ).toBe(0);
  });

  test("update, multi key, no auto", async () => {
    const [Models, Model] = useUser3(dbs);
    await new Models([
      { email: "test1@test.de", name: "Franz" },
      { email: "test1@test.de", name: "Peter" },
      { email: "test1@test.de", name: "Fritz" },
    ]).store();
    const tests = await new Models().load({
      email: "test1@test.de",
    });
    tests.set("a", 101);
    await expect(tests.update()).resolves.toBe(tests);
    await expect(
      (await new Model().loadById({ email: "test1@test.de", name: "Peter" }))
        .content
    ).toMatchObject({ email: "test1@test.de", name: "Peter", a: 101 });
    await expect(
      (await new Model().loadById({ email: "test1@test.de", name: "Franz" }))
        .content
    ).toMatchObject({ email: "test1@test.de", name: "Franz", a: 101 });
    await expect(
      (await new Model().loadById({ email: "test1@test.de", name: "Fritz" }))
        .content
    ).toMatchObject({ email: "test1@test.de", name: "Fritz" });
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
