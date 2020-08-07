"use strict";

const { DoesExist } = require("./errors");
const useAnyModel = require("./anyModel");

module.exports = (dbs, types, collection) => {
  const AnyModel = useAnyModel(dbs, types, collection);

  return class NoneModel extends AnyModel {
    constructor() {
      super();
    }

    async loadNone(filter) {
      const contents = await this._load(
        dbs.collection(this._collection).find(filter, 2)
      );
      if (contents.length > 0) {
        throw new DoesExist();
      }
      return this;
    }
  };
};
