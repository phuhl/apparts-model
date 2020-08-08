"use strict";

const { NotUnique, NotFound, DoesExist } = require("./errors");
const useAnyModel = require("./anyModel");

module.exports = (dbs, types, collection) => {
  const AnyModel = useAnyModel(dbs, types, collection);

  return class OneModel extends AnyModel {
    constructor(content) {
      super();
      if (content) {
        if (Array.isArray(content)) {
          throw new Error(
            "[OneModel] cannot create multiple. Use ManyModel instead!"
          );
        }
        this.content = this._fillInDefaults([content])[0];
      }
    }

    async load(filter) {
      await this._loadOne(dbs.collection(this._collection).find(filter, 2));
      return this;
    }

    async _loadOne(f) {
      const [content, something] = await this._load(f);
      if (something) {
        throw new NotUnique();
      } else if (!content) {
        throw new NotFound();
      }
      this.content = content;
    }

    async loadById(id) {
      if (typeof id === "object") {
        let req = {};
        if (Object.keys(id).length !== this._keys.length) {
          throw new Error(`[OneModel] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(id)}"`);
        }
        this._keys.forEach((key) => {
          if (this._types[key].type === "id") {
            req[key] = dbs.toId(id[key]);
          } else {
            req[key] = id[key];
          }
        });
        await this._loadOne(dbs.collection(this._collection).findById(req));
      } else {
        if (this._keys.length > 1) {
          throw new Error(`[OneModel] loadById not all keys given, E49.
Collection: "${this._collection}", Keys: "${JSON.stringify(
            this._keys
          )}", Id: "${JSON.stringify(id)}"`);
        }
        await this._loadOne(
          dbs
            .collection(this._collection)
            .findById({ [this._keys[0]]: dbs.toId(id) })
        );
      }
      return this;
    }

    async store() {
      try {
        const a = await this._store([this.content]);
        const [x] = a;
        this.content = x;
      } catch (err) {
        // MONGO
        if (err._code === 1) {
          throw new DoesExist();
        } else {
          console.log(err);
          throw new Error("[OneModel] Unexpected error in store: ");
        }
      }
      return this;
    }

    async update() {
      await this._update([this.content]);
      return this;
    }

    set(field, val) {
      this.content[field] = val;
      return this;
    }

    async delete() {
      await dbs
        .collection(this._collection)
        .remove(this._getKeyFilter(this.content));
      return this;
    }

    getPublic() {
      return this._getPublicWithTypes([this.content], this._types, true);
    }
  };
};
