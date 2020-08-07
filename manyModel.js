"use strict";

const { NotUnique, NotFound, DoesExist } = require("./errors");
const useAnyModel = require("./anyModel");

module.exports = (dbs, types, collection) => {
  const AnyModel = useAnyModel(dbs, types, collection);

  return class ManyModel extends AnyModel {
    constructor(contents) {
      super();
      if (contents) {
        if (!Array.isArray(contents)) {
          throw new Error("[ManyModel], contents should be an array");
        }
        this.contents = this._fillInDefaults(contents);
      } else {
        this.contents = [];
      }
    }

    async load(filter, limit, order) {
      this.contents = await this._load(
        dbs.collection(this._collection).find(filter, limit, order)
      );
      return this;
    }

    async loadByIds(ids, limit) {
      if (!Array.isArray(ids)) {
        let req = {};
        if (Object.keys(ids).length !== this._keys.length) {
          throw new Error(`[ManyModel] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(ids)}"`);
        }
        this._keys.forEach((key) => {
          if (this._types[key].type === "id") {
            if (Array.isArray(ids[key])) {
              req[key] = ids[key].map((id) => dbs.toId(id));
            } else {
              req[key] = dbs.toId(ids[key]);
            }
          } else {
            req[key] = ids[key];
          }
        });
        this.contents = await this._load(
          dbs.collection(this._collection).findByIds(req, limit)
        );
      } else {
        if (this._keys.length > 1) {
          throw new Error(`[ManyModel] loadByIds not all keys given, E50.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(ids)}"`);
        }
        this.contents = await this._load(
          dbs
            .collection(this._collection)
            .findByIds({ _id: ids.map((id) => dbs.toId(id)) }, limit)
        );
      }
      return this;
    }

    async loadNone(filter) {
      await this.load(filter);
      if (this.contents.length > 0) {
        throw new DoesExist();
      }
      return this;
    }

    async store() {
      this.contents = await this._store(this.contents);
      return this;
    }

    async update() {
      await this._update(this.contents);
      return this;
    }

    length() {
      return this.contents.length;
    }

    set(field, val) {
      this.contents.forEach((c) => (c[field] = val));
      return this;
    }

    setF(field, f) {
      this.contents.forEach((c) => (c[field] = f(c)));
      return this;
    }

    async deleteAll() {
      if (this.length() == 0) {
        return;
      }
      await dbs
        .collection(this._collection)
        .remove({ _id: { val: this.contents.map((c) => c._id), op: "in" } });
    }

    getPublic() {
      return this._getPublicWithTypes(this.contents, this._types, false);
    }
  };
};
