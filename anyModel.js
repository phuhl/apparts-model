"use strict";

const { NotUnique, NotFound, DoesExist } = require("./errors");

module.exports = (dbs, types, collection) => {
  // No idea why, but has to be here to be populated
  const type = require("@apparts/types");

  return class AnyModel {
    constructor() {
      this._fromDB = false;
      this._collection = collection;
      this._types = types;
      this._keys = Object.keys(types).filter((key) => types[key].key);
      this._autos = Object.keys(types).filter((key) => types[key].auto);
      if (!types) {
        throw new Error("[AnyModel] No types given");
      }
      if (this._keys.length === 0) {
        throw new Error("[AnyModel] Types not well defined: No key found");
      }
      if (!collection) {
        throw new Error("[AnyModel] No collection given");
      }
    }

    _fillInDefaults(values) {
      for (let key in this._types) {
        if (typeof this._types[key].default === "function") {
          values = values.map((c) => ({
            ...c,
            [key]: c[key] || this._types[key].default(c),
          }));
        } else if (this._types[key].default !== undefined) {
          values = values.map((c) => ({
            ...c,
            [key]: c[key] || this._types[key].default,
          }));
        }
      }
      return values;
    }

    async _load(f) {
      if (this._fromDB) {
        throw new Error(
          "[AnyModel] load on already loaded model, Can't load twice"
        );
      }
      const cs = await f.toArray();
      this._fromDB = true;
      const contents = cs.map((c) => this._convertIds(c));
      // this._loadedIds = cs.map((c) => c._id);
      return contents;
    }

    async _update(contents) {
      if (!this._fromDB) {
        throw new Error("[AnyModel] update on non-loaded Model, E29");
      }
      /*
        let newIds = contents.map((c) => c._id);
        if (
        !(
          this._loadedIds.length === newIds.length &&
          this._loadedIds.every((v, i) => newIds[i] === v)
        )
      ) {
        throw new Error(
          "[AnyModel] tried to update but IDs did not match loaded IDs, E46"
        );
      }*/
      if (contents.length > 1) {
        await Promise.all(contents.map((c) => this._updateOne(c)));
      } else {
        if (contents.length > 0) {
          await this._updateOne(contents[0]);
        }
      }
    }

    _removeAutos(c) {
      const val = { ...c };
      for (const auto of this._autos) {
        delete val[auto];
      }
      return val;
    }

    _getKeyFilter(c) {
      const filter = {};
      for (const key of this._keys) {
        filter[key] = c[key];
      }
      return filter;
    }

    async _updateOne(c) {
      await dbs
        .collection(this._collection)
        .updateOne(this._getKeyFilter(c), this._removeAutos(c));
    }

    _convertIds(c) {
      for (let key in this._types) {
        if (!c[key]) {
          continue;
        }
        if (this._types[key].type === "id") {
          c[key] = dbs.fromId(c[key]);
        } else if (this._types[key].type === "array_id") {
          c[key] = c[key].map((v) => dbs.fromId(v));
        }
      }
      return c;
    }

    async _store(contents) {
      if (contents.length < 1) {
        return Promise.resolve();
      }
      if (!this._checkTypes(contents)) {
        throw new Error(
          "[AnyModel] type-constraints not met: " + JSON.stringify(contents)
        );
      }
      const ids = await dbs
        .collection(this._collection)
        .insert(contents, this._autos, this._autos);

      if (ids) {
        contents = contents.map((c, i) => ({
          ...c,
          ...ids[i],
        }));
      }
      return contents;
    }

    _checkTypes(contents) {
      for (let c of contents) {
        for (let key in this._types) {
          if (this._autos.indexOf(key) !== -1) {
            continue;
          }
          let val = c[key];
          if (this._types[key].derived) {
            val = this._types[key].derived(c);
          }
          if (this._types[key].persisted === false) {
            delete c[key];
            continue;
          }
          let present = val !== undefined && val !== null;
          if (
            (!present && !this._types[key].optional) ||
            (present && !type.types[this._types[key].type].check(val))
          ) {
            console.log(key, val);
            return false;
          }
        }
      }
      return true;
    }

    _getPublicWithTypes(contents, types, single) {
      let hasName = false;
      for (let key in types) {
        if (types[key].name) {
          if (hasName) {
            throw new Error("[AnyModel] Multiple Names specified");
          }
          hasName = true;
        }
      }

      let retObj = {};
      if (!hasName) {
        retObj = [];
      }
      for (let c of contents) {
        let obj = {};
        for (let key in types) {
          let val = c[key];
          if (types[key].derived) {
            val = types[key].derived(c);
          }
          if (types[key].public && val !== undefined) {
            if (types[key].mapped) {
              obj[types[key].mapped] = val;
            } else {
              obj[key] = val;
            }
          }
          if (types[key].name) {
            if (types[key].groupBy) {
              retObj[val] = retObj[val] || [];
              retObj[val].push(obj);
            } else {
              retObj[val] = obj;
            }
          }
        }
        if (!hasName) {
          retObj.push(obj);
        }
      }
      if (single) {
        if (!hasName) {
          return retObj[0];
        } else {
          return retObj[Object.keys(retObj)[0]];
        }
      }
      return retObj;
    }
  };
};
